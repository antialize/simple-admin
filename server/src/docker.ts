import * as express from 'express';
import { log, exceptions } from 'winston';
import * as fs from 'fs';
import * as uuid from 'uuid/v4';
import * as crypto from 'crypto';
import { Stream, Writable } from 'stream';
import { db, hostClients, webClients } from './instances';
import { IDockerDeployStart, ACTION, IDockerListDeployments, IDockerListImageTags, IDockerListDeploymentsRes, IDockerListImageTagsRes, Ref, IDockerImageSetPin, IDockerImageTagsCharged, DockerImageTag, IAction, IDockerListDeploymentHistory, IDockerListDeploymentHistoryRes, IDockerListImageTagHistory, IDockerListImageTagHistoryRes, IDockerContainerStart, IDockerContainerStop, IDockerContainerRemove } from '../../shared/actions';
import { WebClient } from './webclient';
import { rootId, hostId, rootInstanceId, IVariables } from '../../shared/type';
import * as Mustache from 'mustache'
import { Job } from './job';
import { HostClient } from './hostclient';
import * as message from './messages';
import * as shellQuote from 'shell-quote';
import { config } from './config';
import nullCheck from '../../shared/nullCheck';
import getOrInsert from '../../shared/getOrInsert';


const docker_upload_path = "/var/tmp/simpleadmin_docker_uploads/";
const docker_blobs_path = "/var/simpleadmin_docker_blobs/";
if (!fs.existsSync(docker_upload_path))
    fs.mkdirSync(docker_upload_path, 0o700);
if (!fs.existsSync(docker_blobs_path))
    fs.mkdirSync(docker_blobs_path, 0o700);

class Count extends Stream.Writable {
    value = 0;
    _write(chunk: any, enc: string, next: (err?: Error) => void) {
        this.value += chunk.length;
        next();
    }
};

class Upload {
    count: Count;
    hash: crypto.Hash;
    writer: fs.WriteStream;
    constructor(public un: string) {
        this.hash = crypto.createHash('sha256');
        this.count = new Count;
        this.writer = fs.createWriteStream(docker_upload_path + un);
    }
};

const HASH_PATTERN = /^sha256:[0-9A-Fa-f]{64}$/;

interface IHostContainer {
    id: string;
    name: string;
    image: string;
    state: string;
    created: number;
}

interface IHostContainerState {
    type: 'docker_container_state';
    id: string;
    state: string;
}

interface IHostContainers {
    type: 'docker_containers';
    full: boolean;
    update: IHostContainer[];
    delete: string[];
}

interface IHostImage {
    id: string;
    digests: string[];
    tags: string[];
    created: number;
}

interface IHostImages {
    type: 'docker_images';
    full: boolean;
    update: IHostImage[];
    delete: string[];
}

interface DeploymentInfo {
    restore: number | null;
    host: number;
    image: string;
    container: string;
    hash: string;
    user: string;
    config: string;
    timeout: any;
    start: number;
    end: number | null;
    id: number | null;
}

class Docker {
    activeUploads = new Map<string, Upload>();
    hostImages = new Map<number, Map<string, IHostImage>>();
    hostContainers = new Map<number, Map<string, IHostContainer>>();

    idc = 0;
    delayedDeploymentInformations = new Map<number, DeploymentInfo>();

    constructor() {
        //setTimeout(this.prune.bind(this), 1000);
        setInterval(this.prune.bind(this), 1000*60*60*12); // prune docker images every 12 houers
    }

    getContainerState(host:number, container:string) : string | undefined {
        const i = this.hostContainers.get(host);
        if (!i) return undefined;
        for (const [id, v] of i) {
            if (v.name != "/"+container) continue;
            return v.state;
        }
        return undefined;
    }

    async checkAuth(req: express.Request, res: express.Response) {
        if (req.headers['authorization']) {
            const auth = Buffer.from((req.headers['authorization'] as string).substr(6), 'base64').toString('utf8');
            const [user, cookie] = auth.split(":");
            let row;
            try {
                row = await db.get("SELECT `pwd`, `otp`, `host`, `user` FROM `sessions` WHERE `sid`=?", cookie);
            } catch (e) {
                row = undefined;
            }
            const now = +new Date() / 1000;

            if (row && row['user'] == 'docker_client') {
                if ( row['pwd'] + 60 * 60 > now
                    && row['otp'] + 60 * 60 > now
                    && row['user'] == user)
                    return row['user'];
            } else {
                if (row
                    && row['pwd'] + 24 * 60 * 60 > now
                    && row['otp'] + 64 * 24 * 60 * 60 > now
                    //&& row['host'] == req.connection.remoteAddress
                    && row['user'] == user)
                    return row['user'];
            }

            log('error', "Auth failure", req.connection.remoteAddress, user, now, row);
            res.status(404)
                .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
                .header('Content-Type', 'application/json; charset=utf-8')

                .json({ errors: [{ 'code': 'DENIED', 'message': 'token expired', 'detail': 'null' }] }).end();
            return null;
        }

        res.status(401)
            .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
            .header('Content-Type', 'application/json; charset=utf-8')

            .json({ errors: [{ 'code': 'UNAUTHORIZED', 'message': 'authentication required', 'detail': 'null' }] }).end();
        return null;
    }

    async get(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        const user = await this.checkAuth(req, res);
        if (user === null) return;

        const p = req.url.split("?")[0].split("/");

        // GET /v2/ Base Check that the endpoint implements Docker Registry API V2.
        if (req.url == "/v2/") {
            res.status(200).end();
            return;
        }

        // GET /v2/<name>/blobs/<digest> Blob Retrieve the blob from the registry identified by digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "blobs") {
            const b = p[4];
            if (!HASH_PATTERN.test(b)) {
                log('error', "Docker get blob: bad name", b);
                res.status(400).end();
                return;
            }
            const path = docker_blobs_path + b;
            if (!fs.existsSync(path)) {
                log('error', "Docker get blob: found ", b);
                res.status(404).end();
                return;
            }
            log('info', "Docker get blob", b);
            res.sendFile(path);
            return;
        }

        // GET 	/v2/<name>/manifests/<reference> Manifest Fetch the manifest identified by name and reference where reference can be a tag or digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "manifests") {
            const row = await db.get("SELECT `manifest`, `hash` FROM `docker_images` WHERE `project`=? AND (`tag`=? OR `hash`=?) ORDER BY `time` DESC LIMIT 1", p[2], p[4], p[4]);
            if (!row) {
                log('error', "Docker get manifest: not found", p[2], [4])
                res.status(404).end();
                return;
            }
            log('info', "Docker get manifest", row['hash']);
            res.header("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
            res.send(row['manifest']).end();
            return;
        }

        //TODO
        // GET /v2/<name>/tags/list Tags Fetch the tags under the repository identified by name.
        // GET /v2/<name>/blobs/uploads/<uuid> Blob Upload Retrieve status of upload identified by uuid. The primary purpose of this endpoint is to resolve the current status of a resumable upload.
        // GET /v2/_catalog	Catalog	Retrieve a sorted, json list of repositories available in the registry.
        log('info', "Docker unhandled get", req.url, req.params);
        res.status(404).end();
    }

    handleUpload(req: express.Request, upload: Upload, final: boolean): Promise<void> {
        //TODO read possible range parameters here
        return new Promise((resolve, reject) => {
            req.pipe(upload.count, { end: final });
            req.pipe(upload.hash, { end: final });
            req.pipe(upload.writer, { end: final });
            req.on('end', resolve);
            req.on('error', reject);
        });
    }

    async put(req: express.Request, res: express.Response) {
        try {
            return await this.putInner(req, res);
        } catch (e) {
            log('error', "Uncaught exception in docker.put", e);
            res.status(500).end();
        }
    }

    async putInner(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        const user = await this.checkAuth(req, res);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // PUT /v2/<name>/blobs/uploads/<uuid> Blob Upload Complete the upload specified by uuid, optionally appending the body as the final chunk.
        if (p.length == 6 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const un = p[5]
            const u = this.activeUploads.get(un);
            if (!u) {
                log('error', "Docker put blob: missing", un);
                res.status(404).end();
                return;
            }
           
            await this.handleUpload(req, u, true);

            log('info', "Docker put blob", un);
            const digest = req.query.digest;
            // TODO verify digest u.hash.digest('hex'));
            fs.renameSync(docker_upload_path + un, docker_blobs_path + digest);
            res.setHeader("Location", "/v2/" + p[2] + "/blobs/" + digest);
            //res.setHeader("Range", "0-"+u.count.value);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Content-Digest", digest);
            res.status(204);
            res.end();
            return;
        }


        // PUT /v2/<name>/manifests/<reference> Manifest Put the manifest identified by name and reference where reference can be a tag or digest.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "manifests") {
            req.setEncoding('utf-8');
            let content = "";
            req.on('data', (chunk) => content += chunk);

            await new Promise((acc, rej) => {
                req.on('end', acc);
                req.on('error', rej);
            });

            log('info', "Docker put manifest", p[2], p[4]);

            // Validate that manifest is JSON.
            const manifest = JSON.parse(content);
            content = JSON.stringify(manifest);

            // Validate that we have all the parts.
            for (const layer of manifest.layers) {
                const {digest} = layer;
                if (!HASH_PATTERN.test(digest)) {
                    log('error', "Docker put manifest: bad layer digest", digest);
                    res.status(400).end();
                    return;
                }
                // TODO: await fs.access() instead.
                try {
                    fs.accessSync(docker_blobs_path + digest);
                } catch (e) {
                    log('error', "Docker put manifest: layer digest does not exist", digest);
                    res.status(400).end();
                    return;
                }
                // If file does not exist, an error is thrown.
            }

            // Read config
            const configDigest = manifest.config.digest;
            if (!HASH_PATTERN.test(configDigest)) {
                log('error', "Docker put manifest: bad config digest", configDigest);
                res.status(400).end();
                return;
            }
            const configString = fs.readFileSync(docker_blobs_path + configDigest, {encoding: "utf-8"});
            const config = JSON.parse(configString);
            const labels = config.config.Labels || {};
            const labelsString = JSON.stringify(labels);

            const hash = crypto.createHash("sha256");
            hash.update(content, 'utf8');
            const h = "sha256:" + hash.digest('hex');

            await db.run("DELETE FROM `docker_images` WHERE `project`=? AND `tag`=? AND `hash`=?", p[2], p[4], h);
            const time = +new Date() / 1000;
            const id = await db.insert("INSERT INTO `docker_images` (`project`, `tag`, `manifest`, `hash`, `user`, `time`, `pin`, `labels`) VALUES (?, ?, ?, ?, ?, ?, 0, ?)", p[2], p[4], content, h, user, time, labelsString);
          
            webClients.broadcast({
                type: ACTION.DockerListImageTagsChanged,
                changed: [
                    {
                        id,
                        image: p[2],
                        hash: h,
                        tag: p[4],
                        user,
                        time,
                        pin: false,
                        labels: labels,
                        removed: null,
                    }
                ],
                removed: []
            });

            res.status(201).header("Location", "/v2/" + p[2] + "/manifests/" + hash).header("Content-Length", "0").header("Docker-Content-Digest", h).end();
            return;
        }

        log('info', "Docker unhandled put", req.url);
        res.status(404).end();
    }

    async patch(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        const user = await this.checkAuth(req, res);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // PATCH /v2/<name>/blobs/uploads/<uuid> Blob Upload Upload a chunk of data for the specified upload.
        if (p.length == 6 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const un = p[5];
            const u = this.activeUploads.get(un);
            if (!u) {
                log('info', "Docker patch blob: missing", un);
                res.status(404).end();
                return;
            }
           
            await this.handleUpload(req, u, false);
            res.setHeader("Location", req.url);
            res.setHeader("Range", "0-" + u.count.value);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Upload-UUID", un);
            res.status(204);
            res.end();
            return;
        }

        log('info', "Docker unhandled patch", req.url);
        res.status(404).end();
    }

    async post(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        const user = await this.checkAuth(req, res);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // POST	/v2/<name>/blobs/uploads/ Initiate Blob Upload Initiate a resumable blob upload. If successful, an upload location will be provided to complete the upload. Optionally, if the digest parameter is present, the request body will be used to complete the upload in a single request.
        if (p.length >= 5 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const u = uuid();
            this.activeUploads.set(u, new Upload(u));
            res.setHeader("Content-Length", "0");
            res.setHeader("Location", "/v2/" + p[2] + "/blobs/uploads/" + u);
            res.setHeader("Range", "0-0");
            res.setHeader("Docker-Upload-UUID", u);
            res.status(202);
            res.end();
            log('info', "Docker post", u);
            return;
        }

        log('info', "Docker unhandled post", req.url);
        res.status(404).end();
    }

    async delete(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        const user = await this.checkAuth(req, res);
        if (user === null || user === "docker_client") return;
        // DELETE /v2/<name>/manifests/<reference> Manifest	Delete the manifest identified by name and reference. Note that a manifest can only be deleted by digest.
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest   
        log('info', "Docker unhandled delete", req.url);
        res.status(404).end();
    }

    deployWithConfig(client: WebClient, host:HostClient, container:string, image:string, ref: Ref, hash:string, conf:string, session:string) {
        return new Promise((accept, reject) => {
            const pyStr = (v:string) => {
                return "r'" + v.replace("'", "\\'") + "'";
            };
        
            const dockerConf: any = {auths: {}};
            dockerConf.auths[config.hostname] = {
                'auth': Buffer.from("docker_client:"+session).toString('base64')
            };

            const envs = [];
            client.sendMessage({type: ACTION.DockerDeployLog, ref, message: "Deploying image "+hash});
            conf += "\n-e DOCKER_HASH=\""+hash+"\"";
            const args = shellQuote.parse(conf.split("\n").join(" "));
            const o = [pyStr('docker'), pyStr('--config'), 't', pyStr('run'), pyStr('-d'), pyStr('--name'), pyStr(container)];
            for (let i=0; i < args.length; ++i) {
                if (args[i] == "-e") {
                    ++i;
                    o.push("'-e'");
                    const parts = args[i].toString().split("=", 2);
                    if (parts.length == 2)
                        envs.push("    os.environ[" + pyStr(parts[0]) + "] = " + pyStr(parts[1]))
                    o.push(pyStr(parts[0]));
                } else {
                    o.push(pyStr(""+args[i]));
                }
            }
            const deployImage = config.hostname + "/" + image + "@" + hash;
            o.push(pyStr(deployImage));


            let script = `
import os, subprocess, shlex, sys, tempfile, shutil, asyncio
started_ok = False
container = ${pyStr(container)}

async def passthrough(i, o):
    global started_ok
    while not i.at_eof():
        line = await i.readline()
        os.write(o, line)
        if b"started HgWiE0XJQKoFzmEzLuR9Tv0bcyWK0AR7N" in line:
            started_ok = True
            return

async def read_log():
    proc = await asyncio.create_subprocess_exec(
        'docker', 'container', 'logs', '--follow', '--timestamps', '--since', '2s', container,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE)
    await asyncio.wait( (passthrough(proc.stdout, 1), passthrough(proc.stderr, 2)), 
        return_when=asyncio.FIRST_COMPLETED, timeout=120)
    try:
        proc.terminate()
    except:
        pass

def run(*args):
    print('$ ' + ' '.join([shlex.quote(arg) for arg in args]))
    sys.stdout.flush()
    subprocess.check_call(args)

t = tempfile.mkdtemp()
try:
    with open(t+'/config.json', 'w') as f:
        f.write(${pyStr(JSON.stringify(dockerConf))})
    print('$ docker pull %s' % (${pyStr(deployImage)},))
    sys.stdout.flush()
    subprocess.call(['docker', '--config', t, 'pull', ${pyStr(deployImage)}])
    print('$ docker stop %s'%(container))
    sys.stdout.flush()
    subprocess.call(['docker', '--config', t, 'stop', container])
    print('$ docker rm %s'%(container))
    sys.stdout.flush()
    subprocess.call(['docker', '--config', t, 'rm', container])
${envs.join("\n")}
    run(${o.join(", ")})

    asyncio.get_event_loop().run_until_complete(read_log())
    if not started_ok:
        raise SystemExit("Service did not start successfully")
finally:
    shutil.rmtree(t, True)
`
           
            class DockerJob extends Job {  
                stdoutPart: string = "";
                stderrPart: string = "";

                constructor() {
                    super(host, null, host);
                    let msg: message.RunScript = {
                        'type': 'run_script', 
                        'id': this.id, 
                        'name': "docke_deploy.py", 
                        'interperter': '/usr/bin/python3', 
                        'content': script,
                        'args': [],
                        'stdin_type': 'none',
                        'stdout_type': 'binary',
                        'stderr_type': 'binary'
                    };
                    host.sendMessage(msg);
                    this.running = true;
                }

                handleMessage(obj: message.Incomming) {
                    super.handleMessage(obj);
                    switch(obj.type) {
                    case 'data':
                        if (obj.source == 'stdout' || obj.source == 'stderr') 
                            client.sendMessage({type: ACTION.DockerDeployLog, ref, message: Buffer.from(obj.data, 'base64').toString('binary')});
                        break;
                    case 'success':
                        if (obj.code == 0) accept();
                        else reject();
                        break;    
                    case 'failure':
                        reject();
                        break;
                    }
                }
            };
            new DockerJob();
        });
    }

    async deploy(client: WebClient, act: IDockerDeployStart) {
        try {
            log('info', "Docker deploy start", act.ref);
            let host: HostClient | null = null;
            for (const id in hostClients.hostClients) {
                const cl = hostClients.hostClients[id];
                if (cl.hostname == act.host || cl.id == act.host) host = cl;
            }
            const user = nullCheck(client.user, "Missing user");

            if (!host || !host.id) {
                client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Invalid hostname or host is not up"});
                return;
            }

            const p = act.image.split(":");
            const image = p[0];
            const reference = p[1] || "latest";
            let hash: string | null = null;
            for (const row of await db.all("SELECT `hash`, `time` FROM `docker_images` WHERE `project`=? AND (`hash`=? OR `tag`=?) ORDER BY `time` DESC LIMIT 1", image, reference, reference)) {
                hash = row.hash;
            }
            
            if (!hash) {
                client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Could not find image to deploy"});
                return;
            }

            const container = act.container || image;
            const oldDeploy = await db.get("SELECT `id`, `config`, `hash`, `endTime` FROM `docker_deployments` WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1", host.id, image, container);
            let conf: string | null = null;
            if (act.config) {
                const configRow = await db.get("SELECT `content` FROM `objects` WHERE `name`=? AND `newest`=1 AND `type`=10226", act.config);
                const hostRow = await db.get("SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?", host.id, hostId);
                const rootRow = await db.get("SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?", rootInstanceId, rootId);
                if (!configRow) {
                    client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Could not find specified config "+act.config});
                    return;
                }
                if (!hostRow || !rootRow) {
                    client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Could not find root or host"});
                    return;
                }
                let variables: {[key:string]: string} = {};
                for (const v of (JSON.parse(rootRow.content) as IVariables).variables)
                    variables[v.key] = v.value;
                for (const v of (JSON.parse(hostRow.content) as IVariables).variables)
                    variables[v.key] = v.value;
                conf = Mustache.render(JSON.parse(configRow.content).content, variables)
            } else if (!oldDeploy || !oldDeploy.config) {
                conf = oldDeploy.config;
                client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Config not supplied and no old deployment found to copy the config from"});
                return;
            }
            if (!conf) throw Error("Missing config");
            
            const now = Date.now() / 1000 | 0;
            const session = crypto.randomBytes(64).toString('hex');
            
            try {
                await db.run("INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)", "docker_client", "", now, now, session);

                try {
                    let id = this.idc++;
                    this.delayedDeploymentInformations.set(id, {
                        host: host.id,
                        container,
                        image,
                        hash,
                        config: conf,
                        user: user,
                        restore: null,
                        timeout: null,
                        start: now,
                        end: null,
                        id: null
                    });
                      
                    await this.deployWithConfig(client, host, container, image, act.ref, hash, conf, session);
                    client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: true, message: "Success"});
                    
                    const ddi = this.delayedDeploymentInformations.get(id);
                    if (ddi)
                        ddi.timeout = setTimeout(
                            () => this.handleDeploymentTimeout(id), 1000 * 60
                        );

                } catch (e) {
                    client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Could not find root or host"});
                    log('error', "Deployment failed", e)
                    
                    if (act.restoreOnFailure && oldDeploy) {
                        client.sendMessage({type: ACTION.DockerDeployLog, ref: act.ref, message: "Deployment failed attempting to redeploy old"});
                        try {
                            let id = this.idc++;
                            this.delayedDeploymentInformations.set(id, {
                                host: host.id,
                                container,
                                image,
                                hash: oldDeploy.hash,
                                config: oldDeploy.config,
                                user: user,
                                restore: oldDeploy.id,
                                timeout: null,
                                start: now,
                                end: null,
                                id: oldDeploy.id,
                            });
                            await this.deployWithConfig(client, host, container, image, act.ref, oldDeploy.hash, oldDeploy.config, session);
                            const ddi = this.delayedDeploymentInformations.get(id);
                            if (ddi)
                                ddi.timeout = setTimeout(
                                    () => this.handleDeploymentTimeout(id), 1000 * 60
                                );
                        } catch (e) {
                        }
                    }
                }
            } finally {
                await db.run("DELETE FROM `sessions` WHERE `user`=? AND `sid`=?", "docker_client", session);
            }
         } catch (e) {
            client.sendMessage({type: ACTION.DockerDeployDone, ref: act.ref, status: false, message: "Deployment failed due to an exception"});
            log('error', "Deployment failed due to an exception", e);
         }
     }

    async getTagsByHash(hashes: string[]) {
        const placeholders = [];
        for (const _ of hashes) placeholders.push("?");
        const tagByHash: {[hash: string]: DockerImageTag} = {};
        for (const row of await db.all("SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `hash` IN (" + placeholders.join(",") + ")", ...hashes)) {
            tagByHash[row.hash] = {
                id: row.id,
                image: row.project,
                hash: row.hash,
                tag: row.tag,
                user: row.user,
                time: row.time,
                pin: row.pin,
                labels: JSON.parse(row.labels || "{}"),
                removed: row.removed,
            };
        }
        return tagByHash;
    }

    async listDeployments(client: WebClient, act: IDockerListDeployments) {
        const res: IDockerListDeploymentsRes = {type: ACTION.DockerListDeploymentsRes, ref: act.ref, deployments: []};
        try {
            const hashes = [];
            for (const row of await db.all("SELECT * FROM `docker_deployments` WHERE `id` IN (SELECT MAX(`id`) FROM `docker_deployments` GROUP BY `host`, `project`, `container`)")) {
                if (act.host && row.host != act.host) continue;
                if (act.image && row.project != act.image) continue;
                hashes.push(row.hash);
                res.deployments.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    name: row.container,
                    host: row.host,
                    start: row.startTime,
                    end: row.endTime,
                    user: row.user,
                    state: this.getContainerState(row.host, row.container),
                    config: row.config,
                });
            }
            const tagByHash = await this.getTagsByHash(hashes);
            for (const deployment of res.deployments) {
                deployment.imageInfo = tagByHash[deployment.hash];
            }
        } finally {
            client.sendMessage(res);
        }
    }

    async listImageTags(client: WebClient, act: IDockerListImageTags) {
        const res: IDockerListImageTagsRes = {type: ACTION.DockerListImageTagsRes, ref: act.ref, tags: []};
        try {
            for (const row of await db.all("SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `id` IN (SELECT MAX(`id`) FROM `docker_images` GROUP BY `project`, `tag`)"))
                res.tags.push(
                    {
                        id: row.id,
                        image: row.project,
                        hash: row.hash,
                        tag: row.tag,
                        user: row.user,
                        time: row.time,
                        pin: row.pin,
                        labels: JSON.parse(row.labels || "{}"),
                        removed: row.removed
                    }
                );
        } finally {
            client.sendMessage(res);
        }
    }


    async listDeploymentHistory(client: WebClient, act: IDockerListDeploymentHistory) {
        const res: IDockerListDeploymentHistoryRes = {type: ACTION.DockerListDeploymentHistoryRes, host: act.host, name: act.name, ref: act.ref, deployments: []};
        try {
            const hashes = [];
            for (const row of await db.all("SELECT * FROM `docker_deployments` WHERE `host`=? AND `container` = ?", act.host, act.name)) {
                hashes.push(row.hash);
                res.deployments.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    name: row.container,
                    host: row.host,
                    start: row.startTime,
                    end: row.endTime,
                    user: row.user,
                    state: row.endTime ? undefined : this.getContainerState(row.host, row.container),
                    config: row.config,
                });
            }
            const tagByHash = await this.getTagsByHash(hashes);
            for (const deployment of res.deployments) {
                deployment.imageInfo = tagByHash[deployment.hash];
            }
        } finally {
            client.sendMessage(res);
        }
    }

    async listImageTagHistory(client: WebClient, act: IDockerListImageTagHistory) {
        const res: IDockerListImageTagHistoryRes = {type: ACTION.DockerListImageTagHistoryRes, ref: act.ref, images: [], image: act.image, tag: act.tag};
        try {
            for (const row of await db.all("SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `id` IN (SELECT MAX(`id`) FROM `docker_images` GROUP BY `project`, `tag`)"))
                res.images.push(
                    {
                        id: row.id,
                        image: row.project,
                        hash: row.hash,
                        tag: row.tag,
                        user: row.user,
                        time: row.time,
                        pin: row.pin,
                        labels: JSON.parse(row.labels || "{}"),
                        removed: row.removed,
                    }
                );
        } finally {
            client.sendMessage(res);
        }
    }

    async imageSetPin(client: WebClient, act: IDockerImageSetPin) {
        await db.run('UPDATE `docker_images` SET pin=? WHERE `id`=?', act.pin?1:0, act.id);
        const res: IDockerImageTagsCharged = {type: ACTION.DockerListImageTagsChanged, changed: [], removed: []};

        for (const row of await db.all("SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `id`=?", act.id))
            res.changed.push(
                {
                    id:row.id,
                    image: row.project,
                    hash: row.hash,
                    tag: row.tag,
                    user: row.user,
                    time: row.time,
                    pin: row.pin,
                    labels: JSON.parse(row.labels || "{}"),
                    removed: row.removed,
                }
            );
        webClients.broadcast(res);
    }

    async broadcastDeploymentChange(o: DeploymentInfo) {
        const tagByHash = await this.getTagsByHash([o.hash]);
        const msg : IAction = {
            type: ACTION.DockerDeploymentsChanged,
            changed: [
                {
                    id: nullCheck(o.id),
                    image: o.image,
                    imageInfo: tagByHash[o.hash],
                    hash: o.hash,
                    name: o.container,
                    host: o.host,
                    start: o.start,
                    end: o.end,
                    user: o.user,
                    state: this.getContainerState(o.host, o.container),
                    config: o.config
                }
            ],
            removed: []
        };
        webClients.broadcast(msg);
    }

  
    async handleDeployment(o: DeploymentInfo) {
        if (o.restore) {
            await db.run("DELETE FROM docker_deployments` WHERE `id` > ? AND `host`=? AND `project`=? AND `container`=?", o.restore, o.host, o.image, o.container);
            await db.run("UPDATE `docker_deployments` SET `endTime` = null WHERE `id`=?", o.restore);
            o.id = o.restore;
        } else {
            const oldDeploy = await db.get("SELECT `id`, `endTime` FROM `docker_deployments` WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1", o.host, o.image, o.container);
            if (oldDeploy && !oldDeploy.endTime)
                await db.run("UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?", o.start, oldDeploy.id);
            o.id = await db.insert("INSERT INTO `docker_deployments` (`project`, `container`, `host`, `startTime`, `config`, `hash`, `user`) VALUES (?, ?, ?, ?, ?, ?, ?)", o.image, o.container, o.host, o.start, o.config, o.hash, o.user);
        }
        await this.broadcastDeploymentChange(o);
    }

    async handleDeploymentTimeout(id: number) {
        try {
            const o = this.delayedDeploymentInformations.get(id);
            if (!o) return;
            log("info", "We did an deployment but we did not hear anything from the client");
            o.timeout = null;
            this.delayedDeploymentInformations.delete(id);
            await this.handleDeployment(o);
        } catch (e) {
            log("info", "Uncaught exception in handleDeploymentTimeout", e);
        }
    }

    async handleHostDockerContainers(host: HostClient, obj: IHostContainers) {
        try {
            if (!host.id) throw Error("Missing host id");
            const containers = getOrInsert(this.hostContainers, host.id, ()=>new Map());
            if (obj.full) containers.clear();
            const images = this.hostImages.get(host.id);
            if (!images) {
                log('error', "No images for host", host.id);
                return;
            }

            const now = Date.now() / 1000 | 0;

            for (const id of obj.delete) {
                const c = containers.get(id);
                if (!c) continue;
                containers.delete(id);
                const container = c.name.substr(1); //For some reason there is a slash in the string??
                const row = await db.get("SELECT * FROM `docker_deployments` WHERE `host`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1", container);
                if (!row || !row.project) continue;
                await db.run("UPDATE `docker_deployments` SET `endTime`=? WHERE `id`=?", now, row.id);
                await this.broadcastDeploymentChange({
                    id: row.id,
                    host: host.id,
                    restore: null,
                    image: row.project,
                    container,
                    hash: row.hash,
                    user: row.user,
                    config: row.config,
                    timeout: null,
                    start: row.start,
                    end: now
                });
            }
        
            for (const u of obj.update) {
                containers.set(u.id, u);
                const image = images.get(u.image);
                if (!image) {
                    log('error', "Could not find image for container")
                    continue;
                }
                const container = u.name.substr(1); //For some reason there is a slash in the string??
                const row = await db.get("SELECT * FROM `docker_deployments` WHERE `host`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1", host.id, container);
                if (!row || !row.project) {
                    log('info', "Could not find project for container", container, row);
                    continue;
                }
                const project = row.project;

                let deploymentInfo: DeploymentInfo | null = null;
                let keep = false;
                for (const [id, info] of this.delayedDeploymentInformations) {
                    if (info.host != host.id || info.container != container || info.image != project) continue;
                    let match = false;
                    for (const d of image.digests)
                        if (info.hash === d || info.hash === d.split("@")[1])
                            match = true;
                    if (match) {
                        deploymentInfo = info;
                        this.delayedDeploymentInformations.delete(id);
                        break
                    }
                }
        
                if (deploymentInfo) {
                    if(deploymentInfo.timeout)
                    clearTimeout(deploymentInfo.timeout);
                } else {
                    for (const d of image.digests) {
                        if (row.hash === d || row.hash === d.split("@")[1])
                            keep = true;
                    }
                    if (row.endTime)
                        keep = false;
                    deploymentInfo = {
                        host: host.id,
                        restore: null,
                        image: project,
                        container,
                        hash: keep ? row.hash : image.digests[0].split('@')[1],
                        user: keep?row.user:null,
                        config: keep ? row.config : null,
                        timeout: null,
                        start: keep ? row.startTime : now,
                        end: null,
                        id: keep ? row.id: null,
                    };
                }
                if (!keep)
                    await this.handleDeployment(deploymentInfo);
                else
                    await this.broadcastDeploymentChange(deploymentInfo);
            }
        } catch (e) {
            console.log(e);
            log("info", "Uncaught exception in handleHostDockerContainers", e);
        }
    }

    async containerCommand(wc: WebClient, hostId:number, container: string , command: string) {
        let host = hostClients.hostClients[hostId];
        if (!host) return;
        
        const script = `
import os, sys
os.execvp("docker", ["docker", "container", sys.argv[1], sys.argv[2]])
`;
        class PJob extends Job {
            constructor() {
                super(host, null, host);
                let msg: message.RunInstant = {
                    'type': 'run_instant',
                    'id': this.id,
                    'name': 'pokeContainer.py',
                    'interperter': '/usr/bin/python3',
                    'content': script,
                    'args': [command, container],
                };
                host.sendMessage(msg);
                this.running = true;
            }
        };
        new PJob();
    }
    
    handleHostDockerContainerState(host: HostClient, obj: IHostContainerState) {
        if (!host.id) throw Error("Missing host id");

        const containers = this.hostContainers.get(host.id);
        if (!containers) return;
        const o = containers.get(obj.id);
        if (!o) return;
        o.state = obj.state;
    }

    handleHostDockerImages(host: HostClient, obj: IHostImages) {
        if (!host.id) throw Error("Missing host id");

        const images = getOrInsert(this.hostImages, host.id, ()=>new Map());
        if (obj.full) images.clear();

        for (const id of obj.delete)
            images.delete(id);

        for (const u of obj.update)
            images.set(u.id, u);
    }

    async prune() {
        try {
            const files = new Set(await new Promise<string[]>( (accept, reject) => {
                fs.readdir(docker_blobs_path, {encoding: "utf8"}, (err, files) => {
                    if (err) reject(err);
                    else accept(files);
                })
            }));

            const used = new Set();
            const now = +new Date() / 1000;
            const grace = 60*60*24 * 14; // Number of seconds to keep something around

            for (const row of await db.all(
                "SELECT \
                  `docker_images`.`manifest`, \
                  `docker_images`.`id`, \
                  `docker_images`.`tag`, \
                  `docker_images`.`time`, \
                  `docker_images`.`project`, \
                  MIN(`docker_deployments`.`startTime`) AS `start`, \
                  MAX(`docker_deployments`.`endTime`) AS `end`, \
                  `docker_images`.`pin`, \
                  (SELECT MAX(`x`.`id`) \
                   FROM `docker_images` AS `x` \
                   WHERE `x`.`project`=`docker_images`.`project` AND `x`.`tag`=`docker_images`.`tag`) AS `newest` \
                FROM `docker_images` \
                LEFT JOIN `docker_deployments` ON `docker_images`.`hash` = `docker_deployments`.`hash` \
                WHERE `removed` IS NULL \
                GROUP BY `docker_images`.`id`")) {
                let keep =
                    row.pin
                    || ((row.tag == 'latest' || row.tag == 'master') && row.newest == row.id)
                    || (row.start && !row.end)
                    || (row.start && row.end &&  row.end + (row.end - row.start) + grace > now)
                    || row.time + grace > now;

                const manifest = JSON.parse(row.manifest);
                if (!files.has(manifest.config.digest)) {
                    keep = false;
                    continue;
                }

                for (const layer of manifest.layers) {
                    if (!files.has(layer.digest)) {
                        keep = false;
                        break;
                    }
                }

                if (keep) {
                    used.add(manifest.config.digest);
                    for (const layer of manifest.layers)
                        used.add(layer.digest);
                } else {
                    await db.run("UPDATE `docker_images` SET `removed`=? WHERE `id`=?", now, row.id);
                }
            }
            const rem = [...files].filter(x => !used.has(x));
            console.log("Used: ", used.size, " total: ", files.size, " remove: ", rem.length);

            for (const file of rem) {
                await new Promise( (acc, rej) => fs.unlink( docker_blobs_path + "/" + file, (e)=> {
                    if (e) rej(e);
                    else acc();
                }));
            }
        } catch (err) {
            console.log("ERROR", err);
        }
    }
}

export const docker = new Docker;
