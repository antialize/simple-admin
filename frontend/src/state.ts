import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import ObjectState from "./ObjectState";
import PageState from "./PageState";
import StatusState from "./StatusState";
import { IAction, IMessage, DockerImageTag }  from "../../shared/actions";
import { IObject2, IObjectDigest } from "../../shared/state";
import { IType } from "../../shared/type";
import { observable } from "mobx";
import { ActionTargets } from "./ActionTargets";
import { DockerImagesState } from "./DockerImages";
import { DockerContainersState } from "./DockerContainers";

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

    sendMessage: (act:IAction)=>void = null;
};

export let state = new State();
export default state;
