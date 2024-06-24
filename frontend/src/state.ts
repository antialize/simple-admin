import type { ActionTargets } from "./ActionTargets";
import type DeploymentState from "./deployment/DeploymentState";
import type DockerContainersState from "./DockerContairsState";
import type DockerImagesState from "./DockerImagesState";
import type LoginState from "./LoginState";
import type ModifiedFilesState from "./ModifiedFilesState";
import type ObjectState from "./ObjectState";
import type PageState from "./PageState";
import type SearchState from "./SearchState";
import type { IAction, IMessage } from "./shared/actions";
import type { IObject2, IObjectDigest } from "./shared/state";
import type { IType } from "./shared/type";
import { computed, observable, makeObservable } from "mobx";

export enum CONNECTION_STATUS {
    CONNECTING,
    CONNECTED,
    AUTHENTICATING,
    LOGIN,
    INITING,
    INITED,
    WAITING,
}

class State {
    constructor() {
        makeObservable(this);
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
    authOtp: boolean = false;

    @observable
    authMessage: string | null = null;

    @observable
    types = new Map<number, IObject2<IType>>();

    @observable
    objectDigests = new Map<number, Map<number, IObjectDigest>>();

    actionTargets: ActionTargets | null = null;

    @observable
    objectListFilter = new Map<number, string>();

    @observable
    messages = new Map<number, IMessage>();

    @computed
    get activeMessages(): number {
        let cnt = 0;
        for (const [_, m] of this.messages) if (!m.dismissed) cnt += 1;
        return cnt;
    }

    @observable
    messageExpanded = new Map<number, boolean>();

    @observable
    messageGroupExpanded = new Map<number, boolean>();

    @observable
    serviceListFilter = new Map<number, string>();

    @observable
    serviceLogVisibility = new Map<number, Map<string, boolean>>();

    @observable
    objects = new Map<number, ObjectState>();

    @observable
    objectUsedBy = new Map<number, Set<number>>();

    @observable
    host_up = new Map<number, boolean>();

    @observable.shallow
    dockerImages: DockerImagesState | null = null;

    @observable.shallow
    dockerContainers: DockerContainersState | null = null;

    @observable.shallow
    modifiedFiles: ModifiedFilesState | null = null;

    @observable.shallow
    search: SearchState | null = null;

    @observable
    hostsUp = new Set<number>();

    doSendMessage: null | ((act: IAction) => void) = null;

    sendMessage(act: IAction): void {
        if (this.doSendMessage === null) throw Error("doSentMessage not set");
        this.doSendMessage(act);
    }
}

export const state = new State();
export default state;
