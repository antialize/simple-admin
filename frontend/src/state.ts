import {observable, computed, action} from "mobx";
import {CONNECTION_STATUS, IAction, IMessage, IDeleteObject, ACTION, IDeployObject, ISaveObject, IFetchObject}  from "../../shared/actions";
import {LoginState} from "./login"
import {  IObject2, IObjectDigest, PAGE_TYPE } from "../../shared/state";
import {ISmartStatus, IStatusUptime, IStatusMeminfo, IStatusLBSRelease, IStatusUname, IStatusLoadAVG, IStatusMount, IService, IStatus, IStatusUpdate} from "../../shared/status"
import { DeploymentState } from "./deployment";
import { PageState } from "./page";
import { IType, hostId, typeId, TypePropType } from "../../shared/type";

export class ObjectState {
    
    @observable
    current: IObject2<any> | null;
    
    @observable
    versions: Map<number,IObject2<any>> ;

    @observable
    touched: boolean;

    loadStatus : "not_loaded" | "loading" | "loaded";

    constructor(public id:number) {
        this.current = null;
        this.versions = new Map;
        this.touched = false;
        this.loadStatus = "not_loaded"
    }

    @action.bound
    save() {
        const a: ISaveObject = {
            type: ACTION.SaveObject,
            id: this.id,
            obj: this.current
        };
        state.sendMessage(a);
        this.touched = true;
    }

    @action.bound
    discard() {
        this.current = null;
        this.touched = false;
        this.loadCurrent();
    }

    @action.bound
    deploy(cancel:boolean, redeploy:boolean) {
        state.page.set({type: PAGE_TYPE.Deployment});
        if (cancel) 
            state.deployment.cancel();
        
        const a: IDeployObject = {
            type: ACTION.DeployObject,
            id: this.id,
            redeploy
        };
        state.sendMessage(a);
    }

    @action.bound
    delete() {
        const a: IDeleteObject = {
            type: ACTION.DeleteObject,
            id: this.id
        };
        state.sendMessage(a);
    }

    @action.bound
    fillDefaults(type: IType) {
        let content = this.current.content;

        if (type.hasVariables && !('variables' in content)) content['variables'] = [];
        if (type.hasContains && !('contains' in content))content['contains'] = [];
        if (type.hasSudoOn && !('sudoOn' in content)) content['sudoOn'] = [];
        if (type.hasSudoOn && !('triggers' in content)) content['triggers'] = [];
        if (type.hasDepends && !('depends' in content)) content['depends'] = [];
        for (const item of type.content || []) {
            switch (item.type) {
            case TypePropType.bool:
            case TypePropType.choice:
            case TypePropType.text:
                if (!(item.name in content)) content[item.name] = item.default;
                break;
            case TypePropType.document:
                if (item.langName && !(item.langName in content)) content[item.langName] = "";
                if (!(item.name in content)) content[item.name] = "";
                break;
            case TypePropType.password:
                if (!(item.name in content))
                    content[item.name] = Array.from((window as any).crypto.getRandomValues(new Uint8Array(18)), (byte:number) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
                break;
            case TypePropType.none:
                break;
            case TypePropType.typeContent:
                if (!(item.name in content)) content[item.name] = [];
            }
        }
    }

    @action.bound
    loadCurrent() {
        const cp = state.page.current;
        if (cp.type != PAGE_TYPE.Object) return;
        if (this.loadStatus == "loading") return;
        if (this.id >= 0) {
            if (this.loadStatus == "not_loaded") {
                let a: IFetchObject = {
                    type: ACTION.FetchObject,
                    id: this.id
                };
                state.sendMessage(a);
                this.loadStatus = "loading";
                return;
            }
            if (cp.version == null) {
                // We have no version so lets pick the newest
                cp.version = 1;
                for (let [v,e] of this.versions)
                    cp.version = Math.max(cp.version, v);
            }
            if (this.current != null && this.current.version == cp.version)
                return; //We are allready modifying the right object
            this.current = JSON.parse(JSON.stringify(this.versions.get(cp.version)));
        } else { // We are modifying a new object
            if (this.current != null) return; //We are allready modifying the right object
            this.current = {id: this.id, type: cp.objectType, name:"", version: null, catagory: "", content: {}, comment: ""};
        }
        this.fillDefaults(state.types.get(cp.objectType).content);
    }
};

export class StatusState {
    @observable.shallow
    uptime: IStatusUptime = {total: 0, idle: 0};
    @observable.shallow
    meminfo: IStatusMeminfo = {avail: 0, total: 0, free: 0, swap_free: 0, swap_total: 0};
    @observable.shallow
    lsb_release: IStatusLBSRelease = {release: "", codename: "", id: "", description: ""};
    @observable.shallow
    uname: IStatusUname = {release: "", sysname: "", machine: "", version: "", nodename: ""};
    @observable.shallow
    loadavg: IStatusLoadAVG = {five_minute: 0, active_processes: 0, ten_minute: 0, minute: 0, total_processes: 0}
    @observable
    mounts: Map<string, IStatusMount> = new Map;
    @observable
    services: Map<string, IService> = new Map;
    @observable
    diskread: number[] = [];
    @observable
    diskwrite: number[] = [];
    @observable
    netread: number[] = [];
    @observable
    netwrite: number[] = [];
    @observable
    cpu: number[] = [];
    @observable
    time: number[] = [];
    @observable
    smart: Map<string, ISmartStatus[]> = new Map;
    @observable
    up: boolean = true

    @action
    setFromInitialState(s:IStatus) {
        this.uptime = s.uptime;
        this.meminfo = s.meminfo;
        this.lsb_release = s.lsb_release;
        this.uname = s.uname;
        this.loadavg = s.loadavg;
        for (let key in s.mounts) this.mounts.set(key, s.mounts[key]);
        for (let key in s.services) this.services.set(key, s.services[key]);
        this.diskread = s.diskread;
        this.diskwrite = s.diskwrite;
        this.netread = s.netread;
        this.netwrite = s.netwrite;
        this.cpu = s.cpu;
        this.time = s.time;
        for (let key in s.smart) this.smart.set(key, s.smart[key]);
        this.up = s.up;
    }

    @action
    applyStatusUpdate(s: IStatusUpdate) {
        const add = <T>(a: T[], v:T) => {
            while (a.length > 1000)
                a.shift();
            a.push(v);
        };
        this.uptime = s.uptime || this.uptime;
        this.meminfo = s.meminfo || this.meminfo;
        this.lsb_release = s.lsb_release || this.lsb_release;
        this.uname = s.uname || this.uname;
        this.loadavg = s.loadavg || this.loadavg;
        add(this.diskread, s.diskread);
        add(this.diskwrite, s.diskwrite);
        add(this.netread, s.netread);
        add(this.netwrite, s.netwrite);
        add(this.cpu, s.cpu);
        add(this.time, s.time);
        this.up = true;
        if (s.smart) {
            this.smart.clear();
            for (let key in s.smart) this.smart.set(key, s.smart[key]);
        }

        for (const key in s.mounts) {
            const mount = s.mounts[key];
            if (mount === null)
                this.mounts.delete(key);
            else
                this.mounts.set(key, mount);
        }

        for (const key in s.services) {
            const service = s.services[key];
            if (service === null)
                this.services.delete(key);
            else
                this.services.set(key, service);
        }
    }
};

class State {
    @observable
    connectionStatus: CONNECTION_STATUS = CONNECTION_STATUS.CONNECTED;

    @observable
    loaded: boolean = false;

    login: LoginState;
    deployment: DeploymentState;
    page: PageState;

    @observable
    authUser: string = null;
    @observable
    authOtp: boolean = false
    @observable
    authMessage: string = null;

    @observable
    types: Map<number, IObject2<IType>>;

    @observable
    objectDigests: Map<number, Map<number, IObjectDigest>>;

    @computed
    get menuTypes() {
        const ans: {id:number, name:string}[] = [];
        for (const [key, type] of this.types) {
            if (type.content.kind == "trigger") continue;
            ans.push({id: type.id, name: type.content.plural});
        }
        ans.sort((l, r)=>{
            if (l.id == hostId) return -1;
            if (r.id == hostId) return 1;
            if (l.id == typeId) return 1;
            if (r.id == typeId) return -1;
            return l.name < r.name?-1:1
        })
        return ans;
    }

    @computed
    get triggers() {
        let triggers:IObject2<IType>[] = [];
        for(const [key, type] of this.types) {
            if (type.content.kind != "trigger") continue;
            triggers.push(type);
        }
        triggers.sort( (l,r) => {
            return l.name < r.name ? -1: 1;
        });
        return triggers;
    }

    @observable
    objectListFilter: Map<number, string>;

    @observable
    messages: Map<number, IMessage>;

    @observable
    messageExpanded: Map<number, boolean>;

    @observable
    messageGroupExpanded: Map<number, boolean>;

    @observable
    serviceListFilter: Map<number, string>;

    @observable
    serviceLogVisibility: Map<number, Map<string, boolean>>;

    @observable
    objects: Map<number, ObjectState>;

    @observable
    status: Map<Number, StatusState>;

    sendMessage: (act:IAction)=>void = null;
};

let state = new State();
export default state;
