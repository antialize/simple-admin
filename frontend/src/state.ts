import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import ObjectState from "./ObjectState";
import PageState from "./PageState";
import StatusState from "./StatusState";
import { IAction, IMessage, DockerImageTag }  from "../../shared/actions";
import { IObject2, IObjectDigest } from "../../shared/state";
import { IType } from "../../shared/type";
import { observable, computed } from "mobx";
import { ActionTargets } from "./ActionTargets";
import { DockerImagesState } from "./DockerImages";
import { DockerContainersState } from "./DockerContainers";
import { ModifiedFilesState } from "./ModifiedFiles";

export enum CONNECTION_STATUS {CONNECTING, CONNECTED, AUTHENTICATING, LOGIN, INITING, INITED, WAITING};

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

    actionTargets: ActionTargets;

    @observable
    objectListFilter: Map<number, string>;

    @observable
    messages: Map<number, IMessage>;

    @computed
    get activeMessages() {
        let cnt = 0;
        for (const [n, m] of this.messages)
            if (!m.dismissed)
                cnt += 1;
        return cnt;
    }

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

    @observable.shallow
    dockerImages: DockerImagesState;

    @observable.shallow
    dockerContainers: DockerContainersState;

    @observable.shallow
    modifiedFiles: ModifiedFilesState;

    sendMessage: (act:IAction)=>void = null;
};

export let state = new State();
export default state;
