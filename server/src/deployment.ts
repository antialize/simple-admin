import {
    DEPLOYMENT_STATUS, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_OBJECT_ACTION, IDeploymentObject, IObject2, IDeploymentTrigger
} from './shared/state'
import { webClients, db, hostClients } from './instances'
import { ACTION, ISetDeploymentStatus, ISetDeploymentMessage, IToggleDeploymentObject, ISetDeploymentObjects, ISetDeploymentObjectStatus, IAddDeploymentLog, IClearDeploymentLog } from './shared/actions'
import { typeId, rootInstanceId, hostId, IVariables, IType, TypePropType, IDepends, ITriggers, ITrigger, ISudoOn, IContains, packageId } from './shared/type'
import * as PriorityQueue from 'priorityqueuejs'
import * as Mustache from 'mustache'
import { DeployJob } from './jobs/deployJob'
import { errorHandler, descript } from './error'

//Type only import
import { HostClient } from './hostclient'
import nullCheck from './shared/nullCheck';

interface IDeployContent {
    script: string | null;
    content: { [key: string]: any } | null;
    triggers: any[];
    deploymentOrder: number;
    typeName: string;
    object: number;
}

function never(n: never, message: string) { throw new Error(message); }

export class Deployment {
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;
    message: string | null = null;
    deploymentObjects: IDeploymentObject[] = [];
    log: string[] = [];

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

    async setupDeploy(deployId: number | null, redeploy: boolean) {
        try {
            const objects: { [id: number]: IObject2<any> } = {};
            const hosts: number[] = [];
            const errors: string[] = [];
            this.deploymentObjects = [];



            const visitContent = (deploymentTitle: string, objContent: { [key: string]: any }, variables: { [key: string]: string }, type: IType, hasVars: boolean, content: { [key: string]: any }) => {

                const template = (name: string, txt: string, variables: { [key: string]: string }) => {
                    try {
                        let vars: { [key:string]: any} = {};
                        for(const [key, val] of Object.entries(variables)) {
                            if (val.startsWith("json:"))
                                vars[key] = JSON.parse(val.substr(5));
                            else
                                vars[key] = val;
                        }
                        return Mustache.render(txt, vars);
                    } catch (err) {
                        errors.push("Template error in " + name + " of " + deploymentTitle + ": " + err);
                        console.log(err);
                    }
                    return "";
                }

                for (let item of type.content || []) {
                    switch (item.type) {
                        case TypePropType.bool:
                            {
                                let v = objContent[item.name] as boolean;
                                if (v === undefined || v === null) v = item.default;
                                if (item.variable) { hasVars = true; variables[item.variable] = v ? "true" : "false"; }
                                content[item.name] = v;
                                break;
                            }
                        case TypePropType.choice:
                            {
                                let v = objContent[item.name] as string;
                                if (v == undefined || v === null) v = item.default;
                                if (item.variable) { hasVars = true; variables[item.variable] = v; }
                                content[item.name] = v;
                                break;
                            }
                        case TypePropType.document:
                            {
                                let v = objContent[item.name] as string;
                                if (v == undefined || v === null) v = "";
                                if (item.template) v = template(item.name, v, variables);
                                if (item.variable) { hasVars = true; variables[item.variable] = v; }
                                content[item.name] = v;
                                break;
                            }
                        case TypePropType.number:
                            {
                                let v = objContent[item.name] as number;
                                if (v == undefined || v === null) v = item.default;
                                content[item.name] = v;
                                break;
                            }
                        case TypePropType.password:
                            {
                                let v = objContent[item.name] as string;
                                if (v == undefined || v === null) v = "";
                                content[item.name] = v;
                                break;
                            }
                        case TypePropType.text:
                            {
                                let v = objContent[item.name] as string;
                                if (v == undefined || v === null) v = item.default;
                                if (v == undefined || v === null) v = "";
                                if (item.template) v = template(item.name, v, variables);
                                if (item.variable) { hasVars = true; variables[item.variable] = v; }
                                content[item.name] = v;
                                if (item.deployTitle) deploymentTitle = v;
                                break;
                            }
                        case TypePropType.none:
                        case TypePropType.typeContent:
                            break;
                        default:
                            never(item, "We should not get here");
                    }
                }
                const script = type.script && template("script", type.script, variables);
                return { deploymentTitle, variables, script, content, hasVars };
            };

            const visitObject = (id: number, variables: { [key: string]: string }, hostId: number) => {
                const obj = objects[id];
                if (!obj) return null;
                const type = objects[obj.type] as IObject2<IType>;

                let content: { [key: string]: any } = {};
                variables = Object.assign({}, variables);
                let hasVars = false;

                if (type.content.hasVariables && 'variables' in obj.content) {
                    for (const v of (obj.content as IVariables).variables)
                        variables[v.key] = v.value;
                    hasVars = true;
                }
                if (type.content.nameVariable)
                    variables[type.content.nameVariable] = obj.name;

                if (type.content.hasSudoOn)
                    content['sudoOn'] = 'sudoOn' in obj.content && obj.content.sudoOn.includes(hostId);

                let deploymentTitle = obj.name;
                return visitContent(obj.name, obj.content, variables, type.content, hasVars, content);
            };

            // Collect all objects
            for (const r of await db.getAllObjectsFull()) {
                objects[r.id] = { id: r.id, name: r.name, type: r.type, content: JSON.parse(r.content), category: r.category, version: r.version, comment: r.comment, time: r.time, author: r.author };
                if (r.type == hostId)
                    hosts.push(r.id);
            }

            // Compute root variables
            let rootVariable: { [key: string]: string } = {};
            if (rootInstanceId in objects) {
                const v = visitObject(rootInstanceId, rootVariable, -1);
                if (v) rootVariable = v.variables;
            }

            // Find deployment objects on a host by host basis
            for (const hostId of hosts) {
                enum NodeType {
                    normal, sentinal
                };

                interface BaseDagNode {
                    next: DagNode[];
                    prev: DagNode[];
                    inCount: number;
                    typeOrder: number;
                    id: number;
                }

                interface SentinalDagNode extends BaseDagNode {
                    type: NodeType.sentinal
                    name: string;
                }

                interface NormalDagNode extends BaseDagNode {
                    type: NodeType.normal;
                    name: string | null;
                    triggers: IDeploymentTrigger[];
                    deploymentTitle: string;
                    script: string | undefined;
                    content: { [key: string]: any }
                    typeId: number;

                }
                type DagNode = SentinalDagNode | NormalDagNode;

                const hostObject = objects[hostId];
                const hostVariables = nullCheck(visitObject(hostId, rootVariable, hostId)).variables;
                const nodes = new Map<string, { node: NormalDagNode, sentinal: SentinalDagNode }>();
                const tops = new Map<number, { node: NormalDagNode, sentinal: SentinalDagNode }>();
                const topVisiting = new Set<number>();
                let hostDeploymentObjects: IDeploymentObject[] = [];

                // Visit an object contained directly in the host
                let visitTop = (id: number) => {
                    if (id == null || !objects[id]) return;
                    if (tops.has(id)) return tops.get(id);
                    if (topVisiting.has(id)) {
                        errors.push("Cyclip dependency");
                        return null;
                    }
                    topVisiting.add(id);
                    const c = nullCheck(visit(id, [], [], hostVariables));
                    tops.set(id, c)
                    topVisiting.delete(id);
                    return c;
                }

                // Visit any object
                let visit = (id: number, path: number[], prefix: number[], /*sentinal: DagNode,*/ variables: { [key: string]: string }) => {
                    if (id == null) return null;
                    const name = prefix.join(".") + "." + id;
                    if (nodes.has(name)) return nodes.get(name);

                    const parent = objects[path[path.length - 1]];
                    if (!(id in objects) || objects[id] == undefined) {
                        errors.push("Missing object " + id + " for host " + hostObject.name + " in " + parent.name);
                        return null;
                    }
                    const obj = objects[id];
                    const type = objects[obj.type] as IObject2<IType>;
                    if (path.indexOf(id) !== -1) {
                        errors.push(parent.name + " contains " + obj.name + " of which it is it self a member");
                        return null;
                    }

                    const v = visitObject(id, variables, hostId);
                    if (!v) {
                        errors.push("Error visiting " + name + " " + obj.name + " " + type + " " + id + " " + v);
                        return null;
                    }
                    v.content['name'] = obj.name;

                    const sentinal: SentinalDagNode = {
                        type: NodeType.sentinal,
                        next: [],
                        prev: [],
                        id,
                        inCount: 0,
                        typeOrder: 0,
                        name: v.deploymentTitle,
                    };

                    const node: NormalDagNode = {
                        type: NodeType.normal,
                        next: [],
                        prev: [],
                        name: prefix.join(".") + "." + id,
                        id,
                        inCount: 0,
                        typeOrder: type.content.deployOrder || 0,
                        triggers: [],
                        deploymentTitle: v.deploymentTitle,
                        script: v.script,
                        content: v.content,
                        typeId: obj.type,
                    };
                    sentinal.prev.push(node);
                    node.next.push(sentinal);
                    nodes.set(nullCheck(node.name), { node, sentinal });

                    const handleTriggers = (triggers: ITrigger[]) => {
                        for (const trigger of triggers) {
                            if (!objects[trigger.id]) continue;
                            let x = visitContent("trigger", trigger.values, Object.assign({}, v.variables), (objects[trigger.id] as IObject2<IType>).content, false, {})
                            if (!x) continue;
                            let t: IDeploymentTrigger = { typeId: trigger.id, script: nullCheck(x.script), content: x.content, title: x.deploymentTitle };
                            node.triggers.push(t);
                        }
                    };

                    if (type.content.hasTriggers && 'triggers' in obj.content)
                        handleTriggers((obj.content as ITriggers).triggers);
                    if ('triggers' in type.content)
                        handleTriggers((type.content as ITriggers).triggers);



                    {
                        const childPath = path.slice(0);
                        childPath.push(id);
                        let childPrefix = prefix;
                        if (v.hasVars) {
                            childPrefix = childPrefix.slice(0);
                            childPrefix.push(id);
                        }

                        const handleContains = (contains: number[]) => {
                            for (const childId of contains) {
                                const c = visit(childId, childPath, childPrefix, v.variables);
                                if (c) {
                                    c.node.prev.push(node);
                                    node.next.push(c.node);
                                    c.sentinal.next.push(sentinal);
                                    sentinal.prev.push(c.sentinal);
                                }
                            }
                        }

                        if (type.content.hasContains && 'contains' in obj.content)
                            handleContains((obj.content as IContains).contains);

                        if ('contains' in type.content)
                            handleContains((type.content as IContains).contains);
                    }

                    const handleDepends = (deps: number[]) => {
                        for (const depId of deps) {
                            const c = visitTop(depId);
                            if (c) {
                                c.sentinal.next.push(node);
                                node.prev.push(c.sentinal);
                            }
                        }
                    };

                    if (type.content.hasDepends && 'depends' in obj.content)
                        handleDepends((obj.content as IDepends).depends);

                    if ('depends' in type.content)
                        handleDepends((type.content as IDepends).depends);

                    return { node, sentinal };
                }

                // Visit all the things
                if ('contains' in hostObject.content)
                    for (const depId of (hostObject.content as IContains).contains)
                        visitTop(depId);

                if (errors.length != 0) continue;

                const hostFull = deployId == null || deployId == hostId;

                // Find all nodes reachable from deployId, and prep them for top sort
                const seen = new Set<DagNode>();
                const toVisit: DagNode[] = [];
                nodes.forEach((c, key) => {
                    if (!c) return;
                    if (hostFull || c.sentinal.id == deployId || c.node.typeId == deployId) {
                        toVisit.push(c.sentinal);
                        seen.add(c.sentinal);
                    }
                });

                // There is nothing to deploy here
                if (toVisit.length == 0 && !hostFull) continue;

                // Perform topsort and construct deployment objects
                while (true) {
                    const node = toVisit.pop();
                    if (!node) break;                 
                    for (const prev of node.prev) {
                        if (!prev) continue;
                        node.inCount++;
                        if (seen.has(prev)) continue;
                        toVisit.push(prev);
                        seen.add(prev);
                    }
                }

                const pq = new PriorityQueue<DagNode>((lhs, rhs) => {
                    if (rhs.typeOrder != lhs.typeOrder) return rhs.typeOrder - lhs.typeOrder;
                    return rhs.id - lhs.id;
                });

                seen.forEach((node) => {
                    const obj = objects[node.id];
                    //if (obj == undefined) return;
                    const type = obj && objects[obj.type] as IObject2<IType>;
                    //if (type == undefined) return;
                    // node.typeOrder = type?type.content.deployOrder: 0;
                    if (node.inCount == 0) pq.enq(node);
                });



                const oldContent: { [name: string]: { content: IDeployContent, type: number, title: string, name: string } } = {};
                for (const row of await db.getDeployments(hostId)) {
                    let c = JSON.parse(row.content) as IDeployContent;
                    if (!c.content) continue;
                    oldContent[row.name] = { content: c, type: row.type, title: row.title, name: row.name };
                }

                while (!pq.isEmpty()) {
                    const node = pq.deq();
                    seen.delete(node);
                    for (const next of node.next) {
                        if (!next) continue;
                        next.inCount--;
                        if (next.inCount == 0)
                            pq.enq(next);
                    }
                    if (node.id == null || node.type == NodeType.sentinal) continue;
                    const obj = objects[node.id];
                    if (!obj) continue;
                    const type = objects[obj.type] as IObject2<IType>;
                    if (type.content.kind == "collection" || type.content.kind == "root" || type.content.kind == "host") continue;
                    const name =  nullCheck(node.name);
                    
                    const o: IDeploymentObject = {
                        index: 0,
                        enabled: true,
                        status: DEPLOYMENT_OBJECT_STATUS.Normal,
                        action: DEPLOYMENT_OBJECT_ACTION.Add,
                        hostName: hostObject.name,
                        title: node.deploymentTitle,
                        name,
                        script: nullCheck(node.script),
                        prevScript: "",
                        nextContent: node.content,
                        prevContent: null,
                        host: hostId,
                        triggers: node.triggers,
                        typeName: type.name,
                        id: node.id,
                        typeId: obj.type,
                        deploymentOrder: node.typeOrder,
                    };

                    if (name in oldContent) {
                        if (!redeploy) {
                            let content = nullCheck(oldContent[name].content);
                            o.prevContent = content.content;
                            o.prevScript = content.script;
                            o.action = DEPLOYMENT_OBJECT_ACTION.Modify;
                        }
                        delete oldContent[name];
                    }
                    hostDeploymentObjects.push(o);
                }

                if (seen.size != 0) {
                    let shortest_cycle: DagNode[] | null = null;
                    for (let seed of seen) {
                        let back = new Map<DagNode, DagNode>();
                        let s1: DagNode[] = [];
                        let s2: DagNode[] = [];
                        for (let n of seed.next) {
                            back.set(n, seed);
                            s2.push(n);
                        }

                        while (s1.length || s2.length) {
                            if (!s1.length) {
                                while (s2.length)
                                    s1.push(s2.pop()!);
                            }
                            let n = s1.pop()!;
                            let cycleFound = false;
                            for (let m of n.next) {
                                if (m === seed) {
                                    cycleFound = true;
                                    break;
                                }
                                if (back.has(m)) continue;
                                back.set(m, n);
                                s2.push(m);
                            }
                            if (cycleFound) {
                                let cycle = [];
                                cycle.push(seed);
                                while (n != seed) {
                                    cycle.push(n);
                                    let m = back.get(n);
                                    if (m == null) {
                                        console.log("Internal errror");
                                        break;
                                    }
                                    n = m;
                                }
                                cycle.push(seed);
                                if (!shortest_cycle || shortest_cycle.length > cycle.length)
                                    shortest_cycle = cycle;
                                break;
                            }
                        }
                    }

                    errors.push("There is a cycle on host " + hostObject.name + ": " +
                        shortest_cycle!.map(v => v.type == NodeType.sentinal ? "Sent " + v.name : v.deploymentTitle).join(" -> ")
                    );



                }

                if ('debPackages' in hostObject.content && !hostObject.content['debPackages'])
                    hostDeploymentObjects = hostDeploymentObjects.filter(o => o.typeId != packageId);


                // Filter away stuff that has not changed
                hostDeploymentObjects = hostDeploymentObjects.filter(o => {
                    let a = JSON.stringify(o.nextContent);
                    let b = JSON.stringify(o.prevContent);
                    return a !== b || o.script != o.prevScript;
                });

                // Find stuff to remove
                if (hostFull) {
                    const values: { content: IDeployContent, type: number, title: string, name: string }[] = [];
                    for (const name in oldContent)
                        values.push(oldContent[name]);

                    values.sort((l, r) => {
                        const lo = l.content.deploymentOrder;
                        const ro = r.content.deploymentOrder;
                        if (lo != ro) return ro - lo;
                        return l.name < r.name ? -1 : 1;
                    })

                    for (const v of values) {
                        let content = nullCheck(v.content);
                        const o: IDeploymentObject = {
                            index: 0,
                            enabled: true,
                            status: DEPLOYMENT_OBJECT_STATUS.Normal,
                            action: DEPLOYMENT_OBJECT_ACTION.Remove,
                            hostName: hostObject.name,
                            title: v.title,
                            name: v.name,
                            script: nullCheck(content.script),
                            prevScript: "",
                            nextContent: null,
                            prevContent: content.content,
                            host: hostId,
                            triggers: content.triggers,
                            typeName: content.typeName,
                            id: content.object,
                            typeId: v.type,
                            deploymentOrder: content.deploymentOrder
                        };
                        hostDeploymentObjects.push(o);
                    }
                }
                let triggers: IDeploymentTrigger[] = [];
                for (let o of hostDeploymentObjects) {
                    this.deploymentObjects.push(o);
                    for (let trigger of o.triggers)
                        triggers.push(trigger);
                }

                triggers.sort((l, r) => {
                    if (l.typeId != r.typeId) return l.typeId - r.typeId;
                    if (l.script != r.script) return l.script < r.script ? -1 : 1;
                    return JSON.stringify(l.content) < JSON.stringify(r.content) ? -1 : 1;
                });

                for (let i = 0; i < triggers.length; ++i) {
                    let t = triggers[i];
                    if (i != 0 && t.typeId == triggers[i - 1].typeId && t.script == triggers[i - 1].script && JSON.stringify(t.content) == JSON.stringify(triggers[i - 1].content)) continue;

                    let o: IDeploymentObject = {
                        index: 0,
                        enabled: true,
                        status: DEPLOYMENT_OBJECT_STATUS.Normal,
                        action: DEPLOYMENT_OBJECT_ACTION.Trigger,
                        hostName: hostObject.name,
                        title: t.title,
                        name: "",
                        script: t.script,
                        prevScript: "",
                        nextContent: t.content,
                        prevContent: null,
                        host: hostId,
                        triggers: [],
                        typeName: objects[t.typeId].name,
                        id: null,
                        typeId: t.typeId,
                        deploymentOrder: 0
                    };
                    this.deploymentObjects.push(o);
                }
            }

            if (errors.length != 0) {
                this.deploymentObjects = [];
                this.setStatus(DEPLOYMENT_STATUS.InvilidTree);
                this.setMessage(errors.join("\n"));
                return;
            }

            for (let i = 0; i < this.deploymentObjects.length; ++i)
                this.deploymentObjects[i].index = i;

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
        } catch (err) {
            this.setStatus(DEPLOYMENT_STATUS.InvilidTree);
            this.setMessage(descript(err).description)
            errorHandler("setupDeployment", false)(err);
        }
    }

    wait(time: number) {
        return new Promise<void>(cb => {
            setTimeout(cb, time);
        })
    }

    setObjectStatus(index: number, status: DEPLOYMENT_OBJECT_STATUS) {
        this.deploymentObjects[index].status = status;
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
        const types: { [id: number]: IObject2<IType> } = {};

        for (const r of await db.getAllObjectsFull())
            if (r.type == typeId)
                types[r.id] = { id: r.id, name: r.name, type: r.type, content: JSON.parse(r.content) as IType, category: r.category, version: r.version, comment: r.comment, time: r.time, author: r.author };


        this.addLog("Deployment started\r\n")

        this.setStatus(DEPLOYMENT_STATUS.Deploying);
        let badHosts = new Set<number>();
        let curHost = -1;

        let hostObjects: { [type: number]: { [name: string]: { [key: string]: any } } } = {};

        for (let i = 0; i < this.deploymentObjects.length; ++i) {
            let o = this.deploymentObjects[i];
            if (!o.enabled) continue;

            if (badHosts.has(o.host)) {
                this.setObjectStatus(o.index, DEPLOYMENT_OBJECT_STATUS.Failure);
                continue
            }

            if (o.host != curHost) {
                curHost = o.host;
                this.addHeader(o.hostName, "=");
                hostObjects = {};
                for (const row of await db.getDeployments(curHost)) {
                    let c = JSON.parse(row.content) as IDeployContent;
                    if (!c.content) continue;
                    if (!(row.type in hostObjects)) hostObjects[row.type] = {};
                    hostObjects[row.type][row.name] = c.content;
                }
            }

            let hostClient = hostClients.hostClients[o.host];
            if (!hostClient || hostClient.closeHandled) {
                this.addLog("Host " + o.hostName + " is down\r\n");
                badHosts.add(o.host);
                this.setObjectStatus(o.index, DEPLOYMENT_OBJECT_STATUS.Failure);
                continue;
            }

            const typeId = nullCheck(o.typeId);

            let type = types[typeId];

            if (type && type.content.kind == "sum") {
                let j = i;

                let curObjects = hostObjects[typeId] || {};
                let nextObjects = Object.assign({}, curObjects);

                for (; j < this.deploymentObjects.length; ++j) {
                    let o2 = this.deploymentObjects[j];
                    if (!o2.enabled) continue;
                    if (o2.typeId !== typeId) break;
                    if (o2.host != o.host) break;
                    this.setObjectStatus(j, DEPLOYMENT_OBJECT_STATUS.Deplying);

                    if (o2.prevContent)
                        delete nextObjects[o2.name];
                    if (o2.nextContent)
                        nextObjects[o2.name] = o2.nextContent;
                }

                let ans = await this.deploySingle(hostClient, o.script, { objects: nextObjects });

                let ok = ans.success && ans.code == 0;
                if (!ok) {
                    for (let k = i; k < j; ++k) {
                        let o2 = this.deploymentObjects[k];
                        if (!o2.enabled) continue;
                        this.setObjectStatus(k, DEPLOYMENT_OBJECT_STATUS.Failure);
                    }
                    if (ans.success)
                        this.addLog("\r\nFailed with exit code " + ans.code + "\r\n");
                    else
                        this.addLog("\r\nFailed\r\n");
                    badHosts.add(o.host);
                } else {
                    hostObjects[typeId] = nextObjects;

                    for (let k = i; k < j; ++k) {
                        let o2 = this.deploymentObjects[k];
                        if (!o2.enabled) continue;

                        let c: IDeployContent = {
                            content: o2.nextContent,
                            script: o2.script,
                            triggers: o2.triggers,
                            deploymentOrder: o2.deploymentOrder,
                            typeName: o2.typeName,
                            object: nullCheck(o2.id),
                        };
                        await db.setDeployment(o2.host, o2.name, JSON.stringify(c), typeId, o2.title);
                        this.setObjectStatus(k, DEPLOYMENT_OBJECT_STATUS.Success);
                    }
                }
                i = j - 1;
                continue;

            }


            this.addHeader(o.title + " (" + o.typeName + ")", "-");

            this.setObjectStatus(o.index, DEPLOYMENT_OBJECT_STATUS.Deplying);

            let ans = { success: false, code: 0 };

            if (type && type.content.kind == "trigger") {
                ans = await this.deploySingle(hostClient, o.script, o.nextContent)
            } else if (!type || type.content.kind == "delta") {
                ans = await this.deploySingle(hostClient, o.script, { old: o.prevContent, new: o.nextContent });
            }

            let ok = ans.success && ans.code == 0;
            if (!ok) {
                if (ans.success)
                    this.addLog("\r\nFailed with exit code " + ans.code + "\r\n");
                else
                    this.addLog("\r\nFailed\r\n");
                if (type && type.content.kind != "trigger")
                    badHosts.add(o.host);
            } else if (type && type.content.kind != "trigger") {
                let c: IDeployContent = {
                    content: o.nextContent,
                    script: o.script,
                    triggers: o.triggers,
                    deploymentOrder: o.deploymentOrder,
                    typeName: o.typeName,
                    object: nullCheck(o.id),
                };
                await db.setDeployment(o.host, o.name, JSON.stringify(c), typeId, o.title);
            }
            this.setObjectStatus(o.index, ok ? DEPLOYMENT_OBJECT_STATUS.Success : DEPLOYMENT_OBJECT_STATUS.Failure);
        }
        this.setStatus(DEPLOYMENT_STATUS.Done);
    }

    getView() {
        return this.deploymentObjects;
    }

    async deployObject(id: number | null, redeploy: boolean) {
        this.setStatus(DEPLOYMENT_STATUS.BuildingTree);
        this.clearLog();
        this.setMessage("");
        await this.setupDeploy(id, redeploy);
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

    toggleObject(index: number | null, enabled: boolean) {
        if (this.status != DEPLOYMENT_STATUS.ReviewChanges) return;

        if (index === null) {
            for (const o of this.deploymentObjects)
                o.enabled = enabled
        } else {
            this.deploymentObjects[index].enabled = enabled;
        }

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

    addHeader(name: string, sep: string = "-") {
        let t = 100 - 4 - name.length;
        let l = t / 2;
        let r = t - l;
        this.addLog("\r\n\x1b[91m" + sep.repeat(l) + "> " + name + " <" + sep.repeat(r) + "\x1b[0m\r\n");
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
