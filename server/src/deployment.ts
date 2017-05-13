import {DEPLOYMENT_STATUS, DEPLOYMENT_OBJECT_STATUS, IDeploymentObject, IContent, IHostContent, IUserContent, ICollectionContent, IPackageContent, IGroupContent, IFileContent, IVariablesContent, IDependsContent, IContainsContent} from '../../shared/state'
import {webClients, db} from './instances'
import {ACTION, ISetDeploymentStatus, ISetDeploymentMessage, IToggleDeploymentObject, ISetDeploymentObjects} from '../../shared/actions'
import * as PriorityQueue from 'priorityqueuejs'

export class Deployment {
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;
    message: string;

    setStatus(s: DEPLOYMENT_STATUS) {
        this.status = s;
        let a: ISetDeploymentStatus = {
            type: ACTION.SetDeploymentStatus,
            status: s
        };
        webClients.broadcast(a);
    }

    setMessage(msg:string) {
        this.message = msg;
        let a: ISetDeploymentMessage = {
            type: ACTION.SetDeploymentMessage,
            message: msg
        };
        webClients.broadcast(a);
    }

    async setupDeploy(deployId:number) {
        console.log("HELLO");
        let objects: {[id:number]: {id:number, name:string, class:string, content:IContent}} = {};
        let root: number = null;
        let hosts: number[] = [];
        console.log("HELLO2"); 
        let rows = await db.getAllObjectsFull();
        console.log("HELLO3");
        for (const r of rows) {
            objects[r.id] = {id: r.id, name: r.name, class: r.type, content: JSON.parse(r.content)};
            if (r.type == 'root')
                root = r.id;
            else if (r.type == 'host')
                hosts.push(r.id);
        }
        console.log("A", rows.length);
        interface DagNode {
            name : string;
            id: number;
            next: DagNode[];
            variables: {[key:string]: string};
            inCount: number;
            host: number;
            classOrder?: number;
        }

        let errors : string[] = [];
        let dagNodes = new Map<string, DagNode>();
        // We first build the full DAG, we later collapse the root and collection nodes
        let rootNode: DagNode = {name:'root', id: root, next: [], variables: {}, inCount: 0, host: 0};
        dagNodes.set(rootNode.name, rootNode);

        console.log("HELLO", hosts);

        for (const hostId of hosts) {
            let deps=new Set<number>();
            let hostObject = objects[hostId];
            let hostNode: DagNode = {name: ""+hostId, id: hostId, next: [], variables: {}, inCount: 0, host: hostId};
            dagNodes.set(hostNode.name, hostNode);
            rootNode.next.push(hostNode);

            let visit = (id: number, path: number[]) => {
                // Id is the id of the user to visit
                // path is the ids of the root to node path
                // deps is a set of dependencies push from above, until we get to an actual object
                const parent = objects[path[path.length-1]];
                const user = path.find((id:number) => objects[id].class == 'user');
                const obj = objects[id];

                if (!(id in objects)) {
                    errors.push("Missing object "+id+" for host "+hostObject.name+" in "+parent.name);
                    return;
                }
                
                let ok = true;
                if (deps.has(id)) {
                    errors.push(parent.name+" depends on "+obj.name+" which in a sequence of dependencies require the first");
                    ok = false;
                }
                if (path.indexOf(id) !== -1) {
                    errors.push(parent.name+" contains "+obj.name+" of which it is it self a member");
                    ok = false;
                }
                if (user != null) {
                    if (obj.class != 'file' && obj.class != 'collection') {
                        errors.push(obj.name+" of class "+obj.class+" is containd in user "+objects[user].name+" but only files and collections are allowed");
                        ok = false;
                    }
                } else if (obj.class == 'host') {
                    errors.push(obj.name+" of class host is contained in the host "+hostObject.name+".");
                    ok = false;
                }
                if (!ok) return;

                let np = null;
                if (obj.class == 'user' || obj.class == 'group' || obj.class == 'package') {
                    np = [hostId, id];
                } else {
                    np = path.filter((id)=>{
                        const o = objects[id];
                        return o.class == 'user' || o.class == 'host' || (o.class == 'collection' && (o.content as ICollectionContent).variables && (o.content as ICollectionContent).variables.length != 0);
                    });
                    np.push(id);
                }
                let name = np.join(".");
                if (dagNodes.has(name)) return dagNodes.get(name);;
                
                let node: DagNode = {name, id, next: [], variables: {}, inCount: 0, host: hostId};

                deps.add(id);
                path.push(id);

                for (let id of path) {
                    let o = objects[id];
                    if ('variables' in o.content) 
                        for (let p of (o.content as IVariablesContent).variables) 
                            node.variables[p.key] = p.value;
                    switch (o.class) {
                    case 'host':
                        node.variables['hostname'] = o.name;
                        break;
                    case 'user':
                        node.variables['user'] = o.name;
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
                    console.log("HERE ", hostId, id);
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
            dagNodes.forEach( (node, key) => {
                if (node.id == deployId) {
                    toVisit.push(node);
                    seen.add(node);
                }
            });
        }

        while (toVisit.length !== 0) {
            let node = toVisit.pop();
            for (let next of node.next) {
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

        seen.forEach( (node) => {
            let obj = objects[node.id];
            switch (obj.class) {
            case 'collection': node.classOrder = 10; break;
            case 'group': node.classOrder = 20; break;
            case 'user': node.classOrder = 30; break;
            case 'file': node.classOrder = 40; break;
            case 'package': node.classOrder = 50; break;
            default: node.classOrder = 900; break;
            }
            if (node.inCount == 0) pq.enq(node);
        });

        let idx = 0;
        let deploymentObjects: IDeploymentObject[] = [];

        while (!pq.isEmpty()) {
            let node = pq.deq();
            for (let next of node.next) {
                next.inCount--;
                if (next.inCount == 0)
                    pq.enq(next);
            }
            let obj = objects[node.id];
            if (!obj || obj.class === 'collection' || obj.class == 'host' || obj.class == 'root') continue;
            let o: IDeploymentObject = {
                index: idx++,
                cls: obj.class,
                host: objects[node.host].name,
                name: objects[node.id].name,
                enabled: true,
                status: DEPLOYMENT_OBJECT_STATUS.Normal
            }; 
            deploymentObjects.push(o);
        }
        this.setStatus(DEPLOYMENT_STATUS.ReviewChanges);
        
        let a: ISetDeploymentObjects = {
            type: ACTION.SetDeploymentObjects,
            objects: deploymentObjects
        };
        webClients.broadcast(a);
    }

    deployObject(id:number) {
        this.setStatus(DEPLOYMENT_STATUS.BuildingTree);
        this.setupDeploy(id);
    }

    start() {}

    stop() {}

    cancel() {
        this.setStatus(DEPLOYMENT_STATUS.Done);
    }

    toggleObject(index: number, enabled: boolean) {
        let a: IToggleDeploymentObject = {
            type: ACTION.ToggleDeploymentObject,
            index,
            enabled,
            source: "server"
        }
        webClients.broadcast(a);
    }
};
