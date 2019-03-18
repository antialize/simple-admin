import {observable, computed} from "mobx";
import {CONNECTION_STATUS, IAction}  from "../../shared/actions";
import {LoginState} from "./login"
import { DEPLOYMENT_STATUS, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_OBJECT_ACTION, IDeploymentTrigger, IDeploymentObject, IObject2, IObjectDigest } from "../../shared/state";
import { DeploymentState } from "./deployment";
import { PageState } from "./page";
import { IType, hostId, typeId } from "../../shared/type";


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

    sendMessage: (act:IAction)=>void = null;
};

let state = new State();
export default state;
