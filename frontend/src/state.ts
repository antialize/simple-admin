import {observable, computed, action} from "mobx";
import {CONNECTION_STATUS, IAction, IMessage, IDeleteObject, ACTION, IDeployObject, ISaveObject}  from "../../shared/actions";
import {LoginState} from "./login"
import {  IObject2, IObjectDigest, PAGE_TYPE } from "../../shared/state";
import { DeploymentState } from "./deployment";
import { PageState } from "./page";
import { IType, hostId, typeId } from "../../shared/type";

class ObjectState {
    id: number;
    
    @observable
    current: IObject2<any> | null;
    
    @observable
    versions: Map<number,IObject2<any>>;

    @observable
    touched: boolean;

    @action
    save() {
        const a: ISaveObject = {
            type: ACTION.SaveObject,
            id: this.id,
            obj: this.current
        };
        state.sendMessage(a);
        this.touched = true;
    }

    @action
    discard() {
        this.current = null;
        this.touched = false;
    }

    @action
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

    @action
    delete() {
        const a: IDeleteObject = {
            type: ACTION.DeleteObject,
            id: this.id
        };
        state.sendMessage(a);
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

    sendMessage: (act:IAction)=>void = null;
};

let state = new State();
export default state;
