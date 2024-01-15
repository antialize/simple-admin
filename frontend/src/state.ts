import type { ActionTargets } from "./ActionTargets";
import type DeploymentState from "./deployment/DeploymentState";
import type DockerContainersState from "./DockerContairsState";
import type DockerImagesState from "./DockerImagesState";
import type LoginState from "./LoginState";
import type ModifiedFilesState from "./ModifiedFilesState";
import type ObjectState from "./ObjectState";
import type PageState from "./PageState";
import type SearchState from "./SearchState";
import type { IAction, IMessage }  from "./shared/actions";
import type { IObject2, IObjectDigest } from "./shared/state";
import type { IType } from "./shared/type";
import { computed, observable, makeObservable } from "mobx";



export enum CONNECTION_STATUS {CONNECTING, CONNECTED, AUTHENTICATING, LOGIN, INITING, INITED, WAITING};

class State {
    constructor() {
        makeObservable(this)
    }

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
        for (const [_, m] of this.messages)
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
    objectUsedBy: Map<number, Set<number>> = new Map;

    @observable
    host_up: Map<Number, boolean> = new Map;

    @observable.shallow
    dockerImages: DockerImagesState | null = null;

    @observable.shallow
    dockerContainers: DockerContainersState | null = null;

    @observable.shallow
    modifiedFiles: ModifiedFilesState | null = null;

    @observable.shallow
    search: SearchState | null = null;

    @observable
    hostsUp: Set<number> = new Set;

    doSendMessage: null | ((act:IAction)=>void)  = null;

    sendMessage(act:IAction) {
        if (this.doSendMessage === null) throw Error("doSentMessage not set");
        this.doSendMessage(act);
    }
};

export let state = new State();
export default state;
