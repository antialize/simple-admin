import {
    DEPLOYMENT_STATUS, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_OBJECT_ACTION, IDeploymentObject, IContent, IHostContent,
    IUserContent, ICollectionContent, IPackageContent, IGroupContent, IFileContent, IVariablesContent, IDependsContent, IContainsContent,
    ITrigger, TRIGGER_TYPE
} from '../../shared/state'
import { webClients, db, hostClients } from './instances'
import { ACTION, ISetDeploymentStatus, ISetDeploymentMessage, IToggleDeploymentObject, ISetDeploymentObjects, ISetDeploymentObjectStatus, IAddDeploymentLog, IClearDeploymentLog } from '../../shared/actions'
import * as PriorityQueue from 'priorityqueuejs'
import * as Mustache from 'mustache'
import { DeployJob } from './jobs/deployJob'
import {errorHandler} from './error'
//Type only import
import { HostClient } from './hostclient'


function never(n: never, message: string) {throw new Error(message);}

interface IFullDeploymentObject {
    inner: IDeploymentObject;
    prev: IContent;
    next: IContent;
    variables: { [key: string]: string };
    name: string;
    host: number;
    object: number;
}

export class Deployment {
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;
    message: string;
    deploymentObjects: IFullDeploymentObject[] = [];
    log: string[];

    setStatus(s: DEPLOYMENT_STATUS) {
        this.status = s;
        let a: ISetDeploymentStatus = {
            type: ACTION.SetDeploymentStatus,
            status: s
        };
        webClients.broadcast(a);
    }

    setMessage(msg: string) {
        this.message = msg;
        let a: ISetDeploymentMessage = {
            type: ACTION.SetDeploymentMessage,
            message: msg
        };
        webClients.broadcast(a);
    }

    async setupDeploy(deployId: number) {
        let objects: { [id: number]: { id: number, name: string, class: string, content: IContent } } = {};
        let root: number = null;
        let hosts: number[] = [];
        let rows = await db.getAllObjectsFull();
        for (const r of rows) {
            objects[r.id] = { id: r.id, name: r.name, class: r.type, content: JSON.parse(r.content) };
            if (r.type == 'root')
                root = r.id;
            else if (r.type == 'host')
                hosts.push(r.id);
        }
        interface DagNode {
            name: string;
            id: number;
            next: DagNode[];
            variables: { [key: string]: string };
            inCount: number;
            host: number;
            classOrder?: number;
        }

        let errors: string[] = [];
        let dagNodes = new Map<string, DagNode>();
        // We first build the full DAG, we later collapse the root and collection nodes
        let rootNode: DagNode = { name: 'root', id: root, next: [], variables: {}, inCount: 0, host: 0 };
        dagNodes.set(rootNode.name, rootNode);

        for (const hostId of hosts) {
            let deps = new Set<number>();
            let hostObject = objects[hostId];
            let hostNode: DagNode = { name: "" + hostId, id: hostId, next: [], variables: {}, inCount: 0, host: hostId };
            dagNodes.set(hostNode.name, hostNode);
            rootNode.next.push(hostNode);

            let visit = (id: number, path: number[]) => {
                if (id == null) return;
                // Id is the id of the user to visit
                // path is the ids of the root to node path
                // deps is a set of dependencies push from above, until we get to an actual object
                const parent = objects[path[path.length - 1]];

                if (!(id in objects) || objects[id] == undefined) {
                    errors.push("Missing object " + id + " for host " + hostObject.name + " in " + parent.name);
                    return;
                }

                const user = path.find((id: number) => objects[id] && objects[id].class == 'user');
                const obj = objects[id];

                let ok = true;
                if (deps.has(id)) {
                    errors.push(parent.name + " depends on " + obj.name + " which in a sequence of dependencies require the first");
                    ok = false;
                }
                if (path.indexOf(id) !== -1) {
                    errors.push(parent.name + " contains " + obj.name + " of which it is it self a member");
                    ok = false;
                }
                if (user != null) {
                    if (obj.class != 'file' && obj.class != 'collection') {
                        errors.push(obj.name + " of class " + obj.class + " is containd in user " + objects[user].name + " but only files and collections are allowed");
                        ok = false;
                    }
                } else if (obj.class == 'host') {
                    errors.push(obj.name + " of class host is contained in the host " + hostObject.name + ".");
                    ok = false;
                }
                if (!ok) return;

                let np = null;
                if (obj.class == 'user' || obj.class == 'group' || obj.class == 'package') {
                    np = [hostId, id];
                } else {
                    np = path.filter((id) => {
                        const o = objects[id];
                        if (o == undefined) return false;
                        return o.class == 'user' || o.class == 'host' || (o.class == 'collection' && (o.content as ICollectionContent).variables && (o.content as ICollectionContent).variables.length != 0);
                    });
                    np.push(id);
                }
                let name = np.join(".");
                if (dagNodes.has(name)) return dagNodes.get(name);;

                let node: DagNode = { name, id, next: [], variables: {}, inCount: 0, host: hostId };
                dagNodes.set(name, node);
                deps.add(id);
                path.push(id);

                for (let id of path) {
                    let o = objects[id];
                    if (o == undefined) continue;

                    if ('variables' in o.content)
                        for (let p of (o.content as IVariablesContent).variables)
                            node.variables[p.key] = p.value;
                    switch (o.class) {
                        case 'host':
                            node.variables['hostname'] = o.name;
                            break;
                        case 'user':
                            node.variables['user'] = o.name;
                            node.variables['email'] = (o.content as IUserContent).email;
                            node.variables['username'] = (o.content as IUserContent).firstName + " " + (o.content as IUserContent).lastName;
                            break;
                    }
                }

                if ('contains' in obj.content) {
                    for (let cid of (obj.content as IContainsContent).contains)
                        node.next.push(visit(cid, path))
                }

                if ('depends' in obj.content) {
                    for (let cid of (obj.content as IDependsContent).depends) {
                        let dnode = visit(cid, [root, hostId]);
                        hostNode.next.push(dnode);
                        dnode.next.push(node);
                    }
                }
                path.pop();
                deps.delete(id);

                return node;
            }

            if ((hostObject.content as IHostContent).contains) {
                for (let id of (hostObject.content as IHostContent).contains) {
                    hostNode.next.push(visit(id, [root, hostId]));
                }
            }
        }

        if (errors.length != 0) {
            this.setStatus(DEPLOYMENT_STATUS.InvilidTree);
            this.setMessage(errors.join("\n"));
        }

        // Find all nodes reachable from deployId, and prep them for top sort
        let seen = new Set<DagNode>();
        let toVisit: DagNode[] = [];
        if (deployId == null) {
            toVisit.push(rootNode);
            seen.add(rootNode);
        } else {
            dagNodes.forEach((node, key) => {
                if (node && node.id == deployId) {
                    toVisit.push(node);
                    seen.add(node);
                }
            });
        }

        while (toVisit.length !== 0) {
            let node = toVisit.pop();
            for (let next of node.next) {
                if (!next) continue;
                next.inCount++;
                if (seen.has(next)) continue;
                toVisit.push(next);
                seen.add(next);
            }
        }

        let pq = new PriorityQueue<DagNode>((lhs, rhs) => {
            if (lhs.host != rhs.host) return rhs.host - lhs.host;
            if (rhs.classOrder != lhs.classOrder) return rhs.classOrder - lhs.classOrder;
            return rhs.id - lhs.id;
        });

        let classOrder = (cls: string) => {
            switch (cls) {
            case 'collection': return 10;
            case 'group': return 20;
            case 'user': return 30;
            case 'file': return 40;
            case 'package': return 50;
            case 'ufwallow': return 60;
            default: return 900;
            }
        }

        seen.forEach((node) => {
            let obj = objects[node.id];
            if (obj == undefined) return;
            node.classOrder = classOrder(obj.class);
            if (node.inCount == 0) pq.enq(node);
        });

        let idx = 0;
        this.deploymentObjects = [];
        let oldContent: { [host: number]: { [name: string]: { content: string, cls: string, title: string, name: string } } } = {};
        let fullDeloyHosts: number[] = [];
        for (let row of await db.getDeployments()) {
            if (!(row.host in oldContent)) oldContent[row.host] = {};
            oldContent[row.host][row.name] = { content: row.content, cls: row.type, title: row.title, name: row.name };
        }
        while (!pq.isEmpty()) {
            let node = pq.deq();
            for (let next of node.next) {
                if (!next) continue;
                next.inCount--;
                if (next.inCount == 0)
                    pq.enq(next);
            }
            let obj = objects[node.id];
            if (obj && obj.class == 'host')
                fullDeloyHosts.push(node.id);

            if (!obj || obj.class === 'collection' || obj.class == 'host' || obj.class == 'root') continue;
            let o: IFullDeploymentObject = {
                inner: {
                    index: idx++,
                    cls: obj.class,
                    host: objects[node.host].name,
                    name: objects[node.id].name,
                    enabled: true,
                    status: DEPLOYMENT_OBJECT_STATUS.Normal,
                    action: DEPLOYMENT_OBJECT_ACTION.Add
                },
                name: node.name,
                next: Object.assign({}, obj.content),
                prev: {},
                host: node.host,
                object: node.id,
                variables: node.variables,
            };
            if (node.host in oldContent && node.name in oldContent[node.host]) {
                o.prev = JSON.parse(oldContent[node.host][node.name].content);
                delete oldContent[node.host][node.name];
                o.inner.action = DEPLOYMENT_OBJECT_ACTION.Modify;
            }
            this.deploymentObjects.push(o);
        }

        // Apply templates
        for (let obj of this.deploymentObjects) {
            switch (obj.inner.cls) {
                case 'file':
                    let ctx = (obj.next as IFileContent);
                    ctx.path = Mustache.render(ctx.path, obj.variables);
                    ctx.data = Mustache.render(ctx.data, obj.variables);;
                    ctx.user = ctx.user || obj.variables['user'] || 'root';
                    ctx.group = ctx.group || obj.variables['user'] || 'root';
                    obj.inner.name = ctx.path;
                    break;
                case 'user':
                    let ctx2 = (obj.next as IUserContent);
                    ctx2.name = obj.inner.name;
                    break;
                case 'group':
                    let ctx3 = (obj.next as IGroupContent);
                    ctx3.name = obj.inner.name;
                    break;
                case 'package':
                    let ctx4 = (obj.next as IPackageContent);
                    ctx4.name = obj.inner.name;
                    break;
            }
        }

        // Find stuff to remove
        for (let host of fullDeloyHosts) {
            if (!(host in oldContent)) continue;

            let values: { content: string, cls: string, title: string, name: string }[] = [];
            for (let name in oldContent[host])
                values.push(oldContent[host][name]);
            values.sort((l, r) => {
                let lo = classOrder(l.cls);
                let ro = classOrder(r.cls);
                if (lo != ro) return ro - lo;
                return l.name < r.name ? -1 : 1;
            })

            for (let v of values) {
                let o: IFullDeploymentObject = {
                    inner: {
                        index: idx++,
                        cls: v.cls,
                        host: objects[host].name,
                        name: v.title,
                        enabled: true,
                        status: DEPLOYMENT_OBJECT_STATUS.Normal,
                        action: DEPLOYMENT_OBJECT_ACTION.Remove,

                    },
                    name: v.name,
                    next: {},
                    prev: JSON.parse(v.content),
                    host: host,
                    object: null,
                    variables: null,
                };
                this.deploymentObjects.push(o);
            }
        }

        // Filter away stuff that has not changed
        this.deploymentObjects = this.deploymentObjects.filter(o => {
            let a = JSON.stringify(o.prev);
            let b = JSON.stringify(o.next);
            return a !== b;
        });

        // Find triggers
        let triggers: (ITrigger & {host:number})[] = [];
        for (let obj of this.deploymentObjects) {
            let ctx = obj.next || obj.prev;
            if ('triggers' in ctx)
                for(let trigger of (ctx as IFileContent).triggers) 
                    triggers.push(Object.assign({host: obj.host}, trigger))
            if (obj.inner.cls == "ufwallow")
                triggers.push({host: obj.host, type: TRIGGER_TYPE.EnableUfw, value:"Enable ufw"})
        }
        triggers.sort((l,r) => {
            if (l.host != r.host) return l.host < r.host ? -1 : 1;
            if (l.value != r.value) return l.value < r.value ? -1 :  1;
            return l.type - r.type;
        })

        for (let i = 0; i < triggers.length; ++i) {
            let t = triggers[i];
            if (i != 0 && t.host == triggers[i-1].host && t.value != triggers[i-1].value && t.type && triggers[i-1].type) continue;
            let cls = "reload";
            switch (t.type) {
            case TRIGGER_TYPE.ReloadService: cls = "reload"; break;
            case TRIGGER_TYPE.RestartService: cls = "restart"; break;
            case TRIGGER_TYPE.EnableUfw: cls = "enableufw"; break;
            case TRIGGER_TYPE.None: cls = "none"; break;
            default: never(t.type, "Case not handled;");
            }

            let o: IFullDeploymentObject = {
                inner: {
                    index: idx++,
                    cls: cls,
                    host: objects[t.host].name,
                    name: t.value,
                    enabled: true,
                    status: DEPLOYMENT_OBJECT_STATUS.Normal,
                    action: DEPLOYMENT_OBJECT_ACTION.Trigger
                },
                name: null,
                next: {},
                prev: {},
                host: t.host,
                object: null,
                variables: null
            }
            this.deploymentObjects.push(o);
        }

        for (let i = 0; i < this.deploymentObjects.length; ++i)
            this.deploymentObjects[i].inner.index = i;

        let a: ISetDeploymentObjects = {
            type: ACTION.SetDeploymentObjects,
            objects: this.getView()
        };
        webClients.broadcast(a);
        if (this.deploymentObjects.length == 0) {
            this.setStatus(DEPLOYMENT_STATUS.Done);
            this.setMessage("Everything up to date, nothing to deploy!");
        } else {
            this.setStatus(DEPLOYMENT_STATUS.ReviewChanges);
        }
    }

    wait(time: number) {
        return new Promise<{}>(cb => {
            setTimeout(cb, time);
        })
    }

    setObjectStatus(index: number, status: DEPLOYMENT_OBJECT_STATUS) {
        this.deploymentObjects[index].inner.status = status;
        let a: ISetDeploymentObjectStatus = {
            type: ACTION.SetDeploymentObjectStatus,
            index: index,
            status: status
        }
        webClients.broadcast(a);
    }

    deploySingle(hostClient: HostClient, script: string, content: any) {
        return new Promise<{ success: boolean, code: number }>(cb => {
            new DeployJob(hostClient, script, content, (success, code) => cb({ success, code }));
        });
    }

    async performDeploy() {
        this.addLog("Deployment started\r\n")

        this.setStatus(DEPLOYMENT_STATUS.Deploying);
        let badHosts = new Set<number>();
        for (let i = 0; i < this.deploymentObjects.length; ++i) {
            let o = this.deploymentObjects[i];
            if (!o.inner.enabled) continue;

            if (badHosts.has(o.host)) {
                this.setObjectStatus(o.inner.index, DEPLOYMENT_OBJECT_STATUS.Failure);
                continue
            }

            let hostClient = hostClients.hostClients[o.host];
            if (!hostClient || hostClient.closeHandled) {
                this.addLog("Host " + o.inner.host + " is down\r\n");
                badHosts.add(o.host);
                this.setObjectStatus(o.inner.index, DEPLOYMENT_OBJECT_STATUS.Failure);
                continue;
            }


            if (o.inner.cls == 'package') {
                let j = i;

                let packages = new Set(await db.getPackages(o.host));
                let nextPackages = new Set(packages);

                for (; j < this.deploymentObjects.length; ++j) {
                    let o2 = this.deploymentObjects[j];
                    if (!o2.inner.enabled) continue;
                    if (o2.inner.cls !== 'package') break;
                    if (o2.host != o.host) break;
                    this.setObjectStatus(j, DEPLOYMENT_OBJECT_STATUS.Deplying);

                    if (o2.prev)
                        nextPackages.delete((o2.prev as IPackageContent).name);
                    if (o2.next)
                        nextPackages.add((o2.next as IPackageContent).name);
                }

                let ans = await this.deploySingle(hostClient, "packages.py", { packages: Array.from(nextPackages).filter(i => i != undefined) });
                let ok = ans.success && ans.code == 0;
                if (!ok) {
                    for (let k = i; k < j; ++k) {
                        let o2 = this.deploymentObjects[k];
                        if (!o2.inner.enabled) continue;
                        this.setObjectStatus(k, DEPLOYMENT_OBJECT_STATUS.Failure);
                    }
                    if (ans.success)
                        this.addLog("\r\nFailed with exit code " + ans.code + "\r\n");
                    else
                        this.addLog("\r\nFailed\r\n");
                    badHosts.add(o.host);
                } else {
                    let add: string[] = [];
                    let remove: string[] = [];
                    nextPackages.forEach(v => { if (!(packages.has(v))) add.push(v); });
                    packages.forEach(v => { if (!(nextPackages.has(v))) remove.push(v); });
                    if (add.length > 0) await db.addPackages(o.host, add);
                    if (remove.length > 0) await db.removePackages(o.host, remove);

                    for (let k = i; k < j; ++k) {
                        let o2 = this.deploymentObjects[k];
                        if (!o2.inner.enabled) continue;
                        await db.setDeployment(o2.host, o2.name, JSON.stringify(o2.next), o2.object, o2.inner.cls, o2.inner.name);
                        this.setObjectStatus(k, DEPLOYMENT_OBJECT_STATUS.Success);
                    }
                }
                i = j - 1;
                continue;
            }


            this.addLog("\r\n============================> " + o.inner.name + " (" + o.inner.cls + ") <================================\r\n");

            this.setObjectStatus(o.inner.index, DEPLOYMENT_OBJECT_STATUS.Deplying);

            let ans = { success: false, code: 0 };

            switch (o.inner.cls) {
            case 'user':
                ans = await this.deploySingle(hostClient, "user.py", { old: o.prev, new: o.next });
                break
            case 'file':
                ans = await this.deploySingle(hostClient, "file.py", { old: o.prev, new: o.next });
                break;
            case 'group':
                ans = await this.deploySingle(hostClient, "group.py", { old: o.prev, new: o.next });
                break;
            case 'ufwallow':
                ans = await this.deploySingle(hostClient, "ufw.py", { old: o.prev, new: o.next });
                break;
            case 'reload':
            case 'restart':
            case 'enableufw':
                ans = await this.deploySingle(hostClient, "trigger.py", { name: o.inner.name, type: o.inner.cls});
                break;
            }

            let ok = ans.success && ans.code == 0;
            if (!ok) {
                if (ans.success)
                    this.addLog("\r\nFailed with exit code " + ans.code + "\r\n");
                else
                    this.addLog("\r\nFailed\r\n");
                if (o.inner.cls != 'reload' && o.inner.cls != 'restart')
                    badHosts.add(o.host);
            } else {
                await db.setDeployment(o.host, o.name, JSON.stringify(o.next), o.object, o.inner.cls, o.inner.name);
            }
            this.setObjectStatus(o.inner.index, ok ? DEPLOYMENT_OBJECT_STATUS.Success : DEPLOYMENT_OBJECT_STATUS.Failure);
        }
        this.setStatus(DEPLOYMENT_STATUS.Done);
    }

    getView() {
        let view = [];
        for (let obj of this.deploymentObjects)
            view.push(obj.inner);
        return view;
    }

    async deployObject(id: number) {
        this.setStatus(DEPLOYMENT_STATUS.BuildingTree);
        this.clearLog();
        this.setMessage("");
        await this.setupDeploy(id);
    }

    async start() {
        if (this.status != DEPLOYMENT_STATUS.ReviewChanges) return;
        await this.performDeploy();
    }

    stop() {
        if (this.status != DEPLOYMENT_STATUS.Deploying) return;
        //TODO we should wait for the current action to finish
        this.setStatus(DEPLOYMENT_STATUS.Done);
    }

    cancel() {
        if (this.status != DEPLOYMENT_STATUS.ReviewChanges) return;
        this.setStatus(DEPLOYMENT_STATUS.Done);
        this.deploymentObjects = [];
        let a: ISetDeploymentObjects = {
            type: ACTION.SetDeploymentObjects,
            objects: this.getView()
        };
        webClients.broadcast(a);
        this.setMessage("");
    }

    toggleObject(index: number, enabled: boolean) {
        if (this.status != DEPLOYMENT_STATUS.ReviewChanges) return;

        this.deploymentObjects[index].inner.enabled = enabled;

        let a: IToggleDeploymentObject = {
            type: ACTION.ToggleDeploymentObject,
            index,
            enabled,
            source: "server"
        }
        webClients.broadcast(a);
    }

    clearLog() {
        this.log = [];
        let a: IClearDeploymentLog = {
            type: ACTION.ClearDeploymentLog,
        }
        webClients.broadcast(a);
    }

    addLog(bytes: string) {
        this.log.push(bytes);

        let a: IAddDeploymentLog = {
            type: ACTION.AddDeploymentLog,
            bytes: bytes
        }
        webClients.broadcast(a);
    }
};
