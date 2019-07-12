import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import ObjectState from "./ObjectState";
import PageState from "./PageState";
import StatusState from "./StatusState";
import { IAction, IMessage }  from "../../shared/actions";
import { IObject2, IObjectDigest } from "../../shared/state";
import { IType } from "../../shared/type";
import { observable, computed } from "mobx";
import { ActionTargets } from "./ActionTargets";
import { DockerImagesState } from "./DockerImages";
import { DockerContainersState } from "./DockerContainers";
import { ModifiedFilesState } from "./ModifiedFiles";
import { DockerDeployState} from "./DockerDeploy";

export enum CONNECTION_STATUS {CONNECTING, CONNECTED, AUTHENTICATING, LOGIN, INITING, INITED, WAITING};

class State {
    @observable
    connectionStatus: CONNECTION_STATUS = CONNECTION_STATUS.CONNECTED;

    @observable
    loaded: boolean = false;

    login: LoginState | null = null;
    deployment: DeploymentState | null = null;
    page: PageState | null = null;

    @observable
    authUser: string | null = null;
    @observable
    authOtp: boolean = false
    @observable
    authMessage: string | null = null;

    @observable
    types: Map<number, IObject2<IType>> = new Map;

    @observable
    objectDigests: Map<number, Map<number, IObjectDigest>> = new Map;

    actionTargets: ActionTargets | null = null;

    @observable
    objectListFilter: Map<number, string> = new Map;

    @observable
    messages: Map<number, IMessage> = new Map;

    @computed
    get activeMessages() {
        let cnt = 0;
        for (const [n, m] of this.messages)
            if (!m.dismissed)
                cnt += 1;
        return cnt;
    }

    @observable
    messageExpanded: Map<number, boolean> = new Map;

    @observable
    messageGroupExpanded: Map<number, boolean> = new Map;

    @observable
    serviceListFilter: Map<number, string> = new Map;

    @observable
    serviceLogVisibility: Map<number, Map<string, boolean>> = new Map;

    @observable
    objects: Map<number, ObjectState> = new Map;

    @observable
    status: Map<Number, StatusState> = new Map;

    @observable.shallow
    dockerImages: DockerImagesState | null = null;

    @observable.shallow
    dockerContainers: DockerContainersState | null = null;

    @observable.shallow
    modifiedFiles: ModifiedFilesState | null = null;

    @observable.shallow
    dockerDeploy: DockerDeployState | null = null;

    doSendMessage: null | ((act:IAction)=>void)  = null;

    sendMessage(act:IAction) {
        if (this.doSendMessage === null) throw Error("doSentMessage not set");
        this.doSendMessage(act);
    }
};

export let state = new State();
export default state;
