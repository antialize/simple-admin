import { fileId } from "./default";
import { db, webClients, hostClients, msg } from "./instances";
import { IModifiedFilesResolve, IModifiedFilesList, IModifiedFilesScan, ModifiedFile, ACTION, IObjectChanged } from "./shared/actions";
import { WebClient } from "./webclient";
import { Job } from "./job";
import * as message from './messages';
import getOrInsert from "./shared/getOrInsert";
import nullCheck from "./shared/nullCheck";
import { log } from "winston";

const cronId = 10240;
const systemdServiceId = 10206;

export class ModifiedFiles {
    lastScan: number | null = null;
    scanning: boolean = false;
    idc: number = 0;
    props = new Map<number, {dead: boolean, updated: boolean}>();
    modifiedFiles: ModifiedFile[] = [];

    async broadcast_changes() {
        const changed = [];
        const removed = [];
        for (const f of this.modifiedFiles) {
            const p = this.props.get(f.id);
            if (!p || !p.updated) continue;
            if (p.dead)
                removed.push(f.id);
            else
                changed.push(f);
            p.updated = false;
        }
        webClients.broadcast({
            type: ACTION.ModifiedFilesChanged,
            full: false,
            scanning: this.scanning,
            lastScanTime: this.lastScan,
            changed,
            removed
        })
        this.modifiedFiles = this.modifiedFiles.filter((f) => {
            const x = this.props.get(f.id);
            return x && !x.dead;
        })
    }

    async scan(client?: WebClient, act?:IModifiedFilesScan) {
        if (this.scanning) return;

        const origLastScanTime = this.lastScan;
        this.scanning = true;
        this.lastScan = +new Date() / 1000;
        await this.broadcast_changes();
        type Obj = {path:string, type:number, host:number, data:string, object:number, actual?: string};
        let objects = new Map<number, Obj[]>();    
        for (const row of await db.all("SELECT `name`, `content`, `type`, `title`, `host` FROM `deployments` WHERE `type` in (?, ?, ?)", fileId, cronId, systemdServiceId)) {
            const content = JSON.parse(row.content);
            if (!content.content) continue;
            let data: string | null = null;
            let path: string | null = null;
            switch (+row.type) {
            case fileId: 
                data = content.content.data; 
                path = content.content.path;
                break;
            case systemdServiceId: 
                data = content.content.unit;
                path = "/etc/systemd/system/"+content.content.name+".service"
                break;
            case cronId: 
                data = content.content.script; 
                path = content.content.path;
                break;
            }
           
            if (!data || !path) continue;
            getOrInsert(objects, row.host, ()=>[]).push({path, type: +row.type, host: row.host, data, object: content.object});
        }

        let promises: Promise<{host: number; content: {path:string, data:string}[]}>[] = [];
        for (const [hostId, objs] of objects) {
            if (!hostClients.hostClients[hostId]) continue;
            const host = hostClients.hostClients[hostId];
            if (!host.auth) continue;

            promises.push(new Promise((accept, reject) => {
                let args: string[] = [];
                for (const o of objs)
                    args.push(o.path);
                let script = `
import sys, base64, json
ans = {'content': []}
for path in sys.argv[1:]:
    data = None
    try:
        with open(path, 'rb') as f:
            data = f.read().decode('utf-8')
    except OSError:
        pass
    ans['content'].append({'path': path, 'data': data})
sys.stdout.write(json.dumps(ans))
sys.stdout.flush()
`;
                let scan_timeout = setTimeout(() => {
                    reject(new Error("Timeout runnig scan on "+host.hostname));
                }, 60000);
               
                class FileContentJob extends Job {  
                    out: string = "";
    
                    constructor() {
                        super(host, null, host);
                        let msg: message.RunScript = {
                            'type': 'run_script', 
                            'id': this.id, 
                            'name': "read_files.py", 
                            'interperter': '/usr/bin/python3', 
                            'content': script,
                            'args': args,
                            'stdin_type': 'none',
                            'stdout_type': 'text',
                            'stderr_type': 'none'
                        };
                        host.sendMessage(msg);
                        this.running = true;
                    }
    
                    handleMessage(obj: message.Incomming) {
                        super.handleMessage(obj);
                        switch(obj.type) {
                        case 'data':
                            if (obj.source == 'stdout')
                                this.out += obj.data;
                            break;
                        case 'success':
                            clearTimeout(scan_timeout);
                            if (obj.code == 0) accept({host: hostId, content: JSON.parse(this.out).content});
                            else reject(new Error("Script returned " + obj.code) );
                            break;    
                        case 'failure':
                            clearTimeout(scan_timeout);
                            reject(new Error("Script failure"));
                            break;
                        }
                    }
                };
                new FileContentJob();
            }));
        }

        try {
            for (const {host, content} of await Promise.all(promises)) {
                if (!content) throw new Error("Failed to run on host " + host);
                let objs = objects.get(host);
                if(!objs || objs.length != content.length) {
                    throw new Error("Not all files there");
                }
                let modified = new Map<string, Obj>();;
                for (let i=0; i < objs.length; ++i) {
                    if (objs[i].path != content[i].path)
                        throw new Error("Path error");

                    objs[i].actual = content[i].data;
                    if (objs[i].actual == objs[i].data)
                        continue;
                    modified.set(objs[i].path, objs[i]);
                }
                for (let m of this.modifiedFiles) {
                    if (m.host != host) continue;
                    const p = nullCheck(this.props.get(m.id));
                    let alter = <A>(o: A, n: A) : A => {
                        if (o != n) p.updated =true;
                        return n;
                    }
                    const o = modified.get(m.path);
                    if (o === undefined) {
                        p.dead = alter(p.dead, true);
                        continue;
                    }
                    modified.delete(m.path);
                    p.dead = alter(p.dead, false);
                    m.actual = alter(m.actual, nullCheck(o.actual));
                    m.deployed = alter(m.deployed, o.data);
                    m.object = alter(m.object, o.object);
                    m.path = alter(m.path, o.path);
                    m.type = alter(m.type, o.type);
                }
                for (const [path, o] of modified) {
                    const id = this.idc++;
                    if (!o.actual) {
                        console.log("Actual is missing!", o);
                        continue;
                    }
                    this.modifiedFiles.push(
                        {
                            id,
                            type: o.type,
                            actual: nullCheck(o.actual),
                            deployed: o.data,
                            host: o.host,
                            path: o.path,
                            object: o.object,
                            current: null
                        }
                    )
                    this.props.set(id, {dead: false, updated: true});
                    msg.emit(o.host, "Modified file", "The file "+o.path+" has been modified since it was deployed");
                }
            }
        } catch(err) {
            this.scanning = false;
            this.lastScan = origLastScanTime;
            await this.broadcast_changes();
            throw (err);
        }

        if (this.modifiedFiles.length != 0) {
            let oids = [];
            for (const f of this.modifiedFiles) 
                oids.push(f.object);

            let m = new Map<number, string>();
            for (const row of await db.all("SELECT `id`, `content` FROM `objects` WHERE `newest`=1 AND `id` in (?"+ ", ?".repeat(oids.length - 1) + ")",  ...oids)) 
                m.set(row.id, row.content);
            
            for (const f of this.modifiedFiles) {
                const c = m.get(f.object);
                if (c === undefined) continue;
                const content = JSON.parse(c);
                switch (f.type) {
                case fileId:
                    f.current = content.data;
                    break
                case systemdServiceId:
                    f.current = content.unit;
                    break;
                case cronId:
                    f.current = content.script;
                    break;
                }
            }
        }

        this.scanning = false;
        await this.broadcast_changes();
    }

    async scan_wrapped() {
        try {
            await this.scan()
        } catch(err) {
            log('error', "Error scanning for modified files: " + err);
        }
    }
    async resolve(client: WebClient, act:IModifiedFilesResolve) {
        let f: ModifiedFile | null = null;
        for (const o of this.modifiedFiles)
            if (o.id == act.id)
                f = o;
        if (f === null) throw new Error("Unable to find object with that id");
        if (act.action == 'redeploy') {
            const host = hostClients.hostClients[f.host];
            if (!host) throw new Error("Host is not up");
            const f2 = f;
            await new Promise<void>((accept, reject) => {
                let script = `
import sys
o = ${JSON.stringify({'path': f2.path, 'content': f2.deployed})}
with open(o['path'], 'w', encoding='utf-8') as f:
    f.write(o['content'])
`;
                class RevertJob extends Job {  
                    constructor() {
                        super(host, null, host);
                        let msg1: message.RunScript = {
                            'type': 'run_script', 
                            'id': this.id, 
                            'name': "revert.py", 
                            'interperter': '/usr/bin/python3', 
                            'content': script,
                            'args': [],
                            'stdin_type': 'none',
                            'stdout_type': 'none',
                            'stderr_type': 'text'
                        };
                        host.sendMessage(msg1);
                        this.running = true;
                    }
    
                    handleMessage(obj: message.Incomming) {
                        super.handleMessage(obj);
                        switch(obj.type) {
                        case 'success':
                            if (obj.code == 0) accept();
                            else reject(new Error("Script returned " + obj.code) );
                            break;    
                        case 'failure':
                            reject(new Error("Script failure"));
                            break;
                        }
                    }
                };
                new RevertJob();
            });
            const pp = nullCheck(this.props.get(act.id));
            pp.dead = true;
            pp.updated = true;
            await this.broadcast_changes();
        } else if (act.action == 'updateCurrent') {
            const row = await db.getNewestObjectByID(f.object);

            const obj = {
                id: f.object,
                version: row.version,
                type: row.type,
                name: row.name,
                content: JSON.parse(row.content),
                category: row.category,
                comment: row.comment,
                time: row.time,
                author: row.author,
            }

            switch (f.type) {
            case fileId:
                obj.content['data'] = act.newCurrent;
                break;
            case systemdServiceId:
                obj.content['unit'] = act.newCurrent;
                break;
            case cronId:
                obj.content['script'] = act.newCurrent;
                break;
            }

            let { id, version } = await db.changeObject(f.object, obj, nullCheck(client.auth.user));
            obj.version = version;
            let res: IObjectChanged = { type: ACTION.ObjectChanged, id: id, object: [obj] };
            webClients.broadcast(res);
        }
    }
    
    async list(client: WebClient, act:IModifiedFilesList) {
        client.sendMessage({
            type: ACTION.ModifiedFilesChanged,
            full: true,
            scanning: this.scanning,
            lastScanTime: this.lastScan,
            changed: this.modifiedFiles.filter((f)=>{const p = this.props.get(f.id); return p && !p.dead}),
            removed: [],
        })
    }

    constructor() {
        setTimeout(()=>this.scan_wrapped(), 1000*2*60);
        setInterval(()=>this.scan_wrapped(), 1000*60*60*12);
    }
}
