import type {
    DEPLOYMENT_OBJECT_STATUS,
    DEPLOYMENT_STATUS,
    IDeploymentObject,
    IObject2,
    IObjectDigest,
    IPage,
} from "./state";
import type { IType } from "./type";

export enum ACTION {
    AddDeploymentLog = "AddDeploymentLog",
    AddLogLines = "AddLogLines",
    AddMessage = "AddMessage",
    Alert = "Alert",
    AuthStatus = "AuthStatus",
    CancelDeployment = "CancelDeployment",
    ClearDeploymentLog = "ClearDeploymentLog",
    DeleteObject = "DeleteObject",
    DeployObject = "DeployObject",
    DockerContainerForget = "DockerContainerForget",
    DockerContainerRemove = "DockerContainerRemove",
    DockerContainerStart = "DockerContainerStart",
    DockerContainerStop = "DockerContainerStop",
    DockerDeployDone = "DockerDeployEnd",
    DockerDeployLog = "DockerDeployLog",
    DockerDeploymentsChanged = "DockerDeploymentsChanged",
    DockerDeployStart = "DockerDeployStart",
    DockerImageSetPin = "DockerImageSetPin",
    DockerImageTagSetPin = "DockerImageTagSetPin",
    DockerListDeploymentHistory = "DockerListDeploymentHistory",
    DockerListDeploymentHistoryRes = "DockerListDeploymentHistoryRes",
    DockerListDeployments = "DockerListDeployments",
    DockerListDeploymentsRes = "DockerListDeploymentsRes",
    DockerListImageByHash = "DockerListImageByHash",
    DockerListImageByHashRes = "DockerListImageByHashRes",
    DockerListImageTagHistory = "DockerListImageTagHistory",
    DockerListImageTagHistoryRes = "DockerListImageTagHistoryRes",
    DockerListImageTags = "DockerListImageTags",
    DockerListImageTagsChanged = "DockerListImageTagsChanged",
    DockerListImageTagsRes = "DockerListImageTagsRes",
    EndLog = "EndLog",
    FetchObject = "FetchObject",
    GenerateKey = "GenerateKey",
    GenerateKeyRes = "GenerateKeyRes",
    GetObjectHistory = "GetObjectHistory",
    GetObjectHistoryRes = "GetObjectHistoryRes",
    GetObjectId = "GetObjectId",
    GetObjectIdRes = "GetObjectIdRes",
    HostDown = "HostDown",
    HostUp = "HostUp",
    ListModifiedFiles = "ListModifiedFiles",
    Login = "Login",
    Logout = "LogOut",
    MessageTextRep = "MessageTextRep",
    MessageTextReq = "MessageTextReq",
    ModifiedFilesChanged = "ModifiedFilesChanged",
    ModifiedFilesList = "ModifiedFilesList",
    ModifiedFilesResolve = "ModifiedFilesResolve",
    ModifiedFilesScan = "ModifiedFilesScan",
    ObjectChanged = "ObjectChanged",
    RequestAuthStatus = "RequestAuthStatus",
    RequestInitialState = "RequestInitialState",
    ResetServerState = "ResetServerState",
    SaveObject = "SaveObject",
    Search = "Search",
    SearchRes = "SearchRes",
    ServiceDeployStart = "ServiceDeployStart",
    ServiceRedeployStart = "ServiceRedeployStart",
    SetDeploymentMessage = "SetDeploymentMessage",
    SetDeploymentObjects = "SetDeploymentObjects",
    SetDeploymentObjectStatus = "SetDeploymentObjectStatus",
    SetDeploymentStatus = "SetDeploymentStatus",
    SetInitialState = "SetInitialState",
    SetMessagesDismissed = "SetMessageDismissed",
    SetPage = "SetPage",
    StartDeployment = "StartDeployment",
    StartLog = "StartLog",
    StatValueChanges = "StatValueChanges",
    StopDeployment = "StopDeployment",
    SubscribeStatValues = "SubscribeStatValues",
    ToggleDeploymentObject = "ToggleDeploymentObject",
    UpdateStatus = "UpdateStatus",
}

export type Ref = number | string;

export interface IFetchObject {
    type: ACTION.FetchObject;
    id: number;
}

export interface IObjectChanged {
    type: ACTION.ObjectChanged;
    id: number;
    object: Array<IObject2<any>>;
}

export interface ISetPageAction {
    type: ACTION.SetPage;
    page: IPage;
}

export interface IMessage {
    id: number;
    host: number | null;
    type: string;
    subtype: string | null;
    message: string;
    fullMessage: boolean;
    time: number;
    url: string | null;
    dismissed: boolean;
}

export interface ISetInitialState {
    type: ACTION.SetInitialState;
    objectNamesAndIds: Record<string, IObjectDigest[]>;
    messages: IMessage[];
    deploymentObjects: IDeploymentObject[];
    deploymentStatus: DEPLOYMENT_STATUS;
    deploymentMessage: string;
    deploymentLog: string[];
    types: Record<number, IObject2<IType>>;
    hostsUp: number[];
    usedBy: Array<[number, number]>;
}

export interface IStartLog {
    type: ACTION.StartLog;
    host: number;
    logtype: "file" | "dmesg" | "journal";
    id: number;
    unit?: string;
}

export interface IEndLog {
    type: ACTION.EndLog;
    host: number;
    id: number;
}

export interface IAddLogLines {
    type: ACTION.AddLogLines;
    id: number;
    lines: string[];
}

export interface IMessageTextReqAction {
    type: ACTION.MessageTextReq;
    id: number;
}

export interface IMessageTextRepAction {
    type: ACTION.MessageTextRep;
    id: number;
    message: string;
}

export interface IAddMessage {
    type: ACTION.AddMessage;
    message: IMessage;
}

export interface ISetMessagesDismissed {
    type: ACTION.SetMessagesDismissed;
    ids: number[];
    dismissed: boolean;
    source: "server" | "webclient";
}

export interface ISaveObject {
    type: ACTION.SaveObject;
    id: number;
    obj?: IObject2<any>;
}

export interface ISearch {
    type: ACTION.Search;
    ref: Ref;
    pattern: string;
}

export interface ISearchRes {
    type: ACTION.SearchRes;
    ref: Ref;
    objects: Array<{
        type: number;
        id: number;
        version: number;
        name: string;
        comment: string;
        content: string;
    }>;
}

export interface IHostDown {
    type: ACTION.HostDown;
    id: number;
}

export interface IHostUp {
    type: ACTION.HostUp;
    id: number;
}

export interface IDeployObject {
    type: ACTION.DeployObject;
    id: number | null;
    redeploy: boolean;
}

export interface IDeleteObject {
    type: ACTION.DeleteObject;
    id: number;
}

export interface ISetDeploymentStatus {
    type: ACTION.SetDeploymentStatus;
    status: DEPLOYMENT_STATUS;
}

export interface IResetServerState {
    type: ACTION.ResetServerState;
    host: number;
}

export interface ISetDeploymentMessage {
    type: ACTION.SetDeploymentMessage;
    message: string;
}

export interface ISetDeploymentObjects {
    type: ACTION.SetDeploymentObjects;
    objects: IDeploymentObject[];
}

export interface IClearDeploymentLog {
    type: ACTION.ClearDeploymentLog;
}

export interface IAddDeploymentLog {
    type: ACTION.AddDeploymentLog;
    bytes: string;
}

export interface ISetDeploymentObjectStatus {
    type: ACTION.SetDeploymentObjectStatus;
    index: number;
    status: DEPLOYMENT_OBJECT_STATUS;
}

export interface IToggleDeploymentObject {
    type: ACTION.ToggleDeploymentObject;
    index: number | null;
    enabled: boolean;
    source: "server" | "webclient";
}

export interface IStopDeployment {
    type: ACTION.StopDeployment;
}

export interface IStartDeployment {
    type: ACTION.StartDeployment;
}

export interface ICancelDeployment {
    type: ACTION.CancelDeployment;
}

export interface IAlert {
    type: ACTION.Alert;
    message: string;
    title: string;
}

export interface IRequestAuthStatus {
    type: ACTION.RequestAuthStatus;
    session?: string;
}

export interface IAuthStatus {
    type: ACTION.AuthStatus;
    message: string | null;
    auth: boolean;
    user: string | null;
    pwd: boolean;
    otp: boolean;
    admin: boolean;
    dockerPull: boolean;
    dockerPush: boolean;
    session: string | null;
}

export interface ILogin {
    type: ACTION.Login;
    user: string;
    pwd: string;
    otp: string;
}

export interface ILogout {
    type: ACTION.Logout;
    forgetPwd: boolean;
    forgetOtp: boolean;
}

export interface IRequestInitialState {
    type: ACTION.RequestInitialState;
}

export interface ISubscribeStatValues {
    type: ACTION.SubscribeStatValues;
    target: number;
    host: number;
    values: string[] | null;
}

export interface IStatValueChanges {
    type: ACTION.StatValueChanges;
    target: number;
    host: number;
    name: string;
    value: number;
    level: number;
    index: number;
}

export interface IDockerDeployStart {
    type: ACTION.DockerDeployStart;
    host: number | string;
    image: string;
    container?: string;
    config?: string;
    restoreOnFailure: boolean;
    ref: Ref;
}

export interface IServiceDeployStart {
    type: ACTION.ServiceDeployStart;
    ref: Ref;
    host: number | string;
    description: string;
    image?: string;
}

export interface IServiceRedeployStart {
    type: ACTION.ServiceRedeployStart;
    ref: Ref;
    deploymentId: number;
}

export interface IDockerDeployLog {
    type: ACTION.DockerDeployLog;
    ref: Ref;
    message: string;
}

export interface IDockerDeployDone {
    type: ACTION.DockerDeployDone;
    ref: Ref;
    status: boolean;
    message?: string;
    id?: number;
}

export interface IGenerateKey {
    type: ACTION.GenerateKey;
    ref: Ref;
    ssh_public_key?: string;
}

export interface IGenerateKeyRes {
    type: ACTION.GenerateKeyRes;
    ref: Ref;
    ca_pem: string;
    key: string;
    crt: string;
    ssh_host_ca?: string;
    ssh_crt?: string;
}

export interface IGetObjectId {
    type: ACTION.GetObjectId;
    ref: Ref;
    path: string;
}

export interface IGetObjectIdRes {
    type: ACTION.GetObjectIdRes;
    ref: Ref;
    id: number | null;
}

export interface IGetObjectHistory {
    type: ACTION.GetObjectHistory;
    ref: Ref;
    id: number;
}

export interface IGetObjectHistoryRes {
    type: ACTION.GetObjectHistoryRes;
    ref: Ref;
    id: number;
    history: Array<{
        version: number;
        time: number;
        author: string | null;
    }>;
}

export interface IDockerListImageTags {
    type: ACTION.DockerListImageTags;
    ref: Ref;
}

export interface DockerImageTag {
    id: number;
    image: string;
    tag: string;
    hash: string;
    time: number;
    user: string;
    pin: boolean;
    labels: Record<string, string>;
    removed: number | null;
}

export interface IDockerListImageTagsRes {
    type: ACTION.DockerListImageTagsRes;
    ref: Ref;
    tags: DockerImageTag[];
    pinnedImageTags?: Array<{ image: string; tag: string }>;
}

export interface IDockerImageTagsCharged {
    type: ACTION.DockerListImageTagsChanged;
    changed: DockerImageTag[];
    removed: Array<{ image: string; hash: string }>;
    imageTagPinChanged?: Array<{ image: string; tag: string; pin: boolean }>;
}

export interface IDockerListDeployments {
    type: ACTION.DockerListDeployments;
    ref: Ref;
    host?: number;
    image?: string;
}

export interface DockerDeployment {
    id: number;
    image: string;
    imageInfo?: DockerImageTag;
    hash?: string;
    name: string;
    user: string;
    start: number;
    end: number | null;
    host: number;
    state?: string;
    config: string;
    timeout: number;
    usePodman: boolean;
    service: boolean;
}

export interface IDockerListDeploymentsRes {
    type: ACTION.DockerListDeploymentsRes;
    ref: Ref;
    deployments: DockerDeployment[];
}

export interface IDockerDeploymentsChanged {
    type: ACTION.DockerDeploymentsChanged;
    changed: DockerDeployment[];
    removed: Array<{ host: number; name: string }>;
}

export interface IDockerContainerStart {
    type: ACTION.DockerContainerStart;
    host: number;
    container: string;
}

export interface IDockerContainerStop {
    type: ACTION.DockerContainerStop;
    host: number;
    container: string;
}

export interface IDockerContainerRemove {
    type: ACTION.DockerContainerRemove;
    host: number;
    container: string;
}

export interface IDockerContainerForget {
    type: ACTION.DockerContainerForget;
    host: number;
    container: string;
}

export interface IDockerListImageByHash {
    type: ACTION.DockerListImageByHash;
    hash: string[];
    ref: Ref;
}

export interface IDockerListImageByHashRes {
    type: ACTION.DockerListImageByHashRes;
    ref: Ref;
    tags: Record<string, DockerImageTag>;
}

export interface IDockerImageSetPin {
    type: ACTION.DockerImageSetPin;
    id: number;
    pin: boolean;
}

export interface IDockerImageTagSetPin {
    type: ACTION.DockerImageTagSetPin;
    image: string;
    tag: string;
    pin: boolean;
}

export interface IDockerListDeploymentHistory {
    type: ACTION.DockerListDeploymentHistory;
    host: number;
    name: string;
    ref: Ref;
}

export interface IDockerListDeploymentHistoryRes {
    type: ACTION.DockerListDeploymentHistoryRes;
    host: number;
    name: string;
    ref: Ref;
    deployments: DockerDeployment[];
}

export interface IDockerListImageTagHistory {
    type: ACTION.DockerListImageTagHistory;
    image: string;
    tag: string;
    ref: Ref;
}

export interface IDockerListImageTagHistoryRes {
    type: ACTION.DockerListImageTagHistoryRes;
    image: string;
    tag: string;
    ref: Ref;
    images: DockerImageTag[];
}

export interface ModifiedFile {
    id: number;
    type: number;
    host: number;
    object: number;
    deployed: string;
    actual: string;
    current: string | null;
    path: string;
}

export interface IModifiedFilesScan {
    type: ACTION.ModifiedFilesScan;
}

export interface IModifiedFilesList {
    type: ACTION.ModifiedFilesList;
}

export interface IModifiedFilesChanged {
    type: ACTION.ModifiedFilesChanged;
    lastScanTime: number | null;
    scanning: boolean;
    full: boolean;
    changed: ModifiedFile[];
    removed: number[];
}

export interface IModifiedFilesResolve {
    type: ACTION.ModifiedFilesResolve;
    id: number;
    action: "redeploy" | "updateCurrent";
    newCurrent: string | null;
}

export type IAction =
    | IAddDeploymentLog
    | IAddLogLines
    | IAddMessage
    | IAlert
    | IAuthStatus
    | ICancelDeployment
    | IClearDeploymentLog
    | IDeleteObject
    | IDeployObject
    | IDockerContainerForget
    | IDockerContainerRemove
    | IDockerContainerStart
    | IDockerContainerStop
    | IDockerDeployDone
    | IDockerDeployLog
    | IDockerDeploymentsChanged
    | IDockerDeployStart
    | IDockerImageSetPin
    | IDockerImageTagsCharged
    | IDockerImageTagSetPin
    | IDockerListDeploymentHistory
    | IDockerListDeploymentHistoryRes
    | IDockerListDeployments
    | IDockerListDeploymentsRes
    | IDockerListImageByHash
    | IDockerListImageByHashRes
    | IDockerListImageTagHistory
    | IDockerListImageTagHistoryRes
    | IDockerListImageTags
    | IDockerListImageTagsRes
    | IEndLog
    | IFetchObject
    | IGenerateKey
    | IGenerateKeyRes
    | IGetObjectHistory
    | IGetObjectHistory
    | IGetObjectHistoryRes
    | IGetObjectHistoryRes
    | IGetObjectId
    | IGetObjectIdRes
    | IHostDown
    | IHostUp
    | ILogin
    | ILogout
    | IMessageTextRepAction
    | IMessageTextReqAction
    | IModifiedFilesChanged
    | IModifiedFilesList
    | IModifiedFilesResolve
    | IModifiedFilesScan
    | IObjectChanged
    | IRequestAuthStatus
    | IRequestInitialState
    | IResetServerState
    | ISaveObject
    | ISearch
    | ISearchRes
    | IServiceDeployStart
    | IServiceRedeployStart
    | ISetDeploymentMessage
    | ISetDeploymentObjects
    | ISetDeploymentObjectStatus
    | ISetDeploymentStatus
    | ISetInitialState
    | ISetMessagesDismissed
    | ISetPageAction
    | IStartDeployment
    | IStartDeployment
    | IStartLog
    | IStatValueChanges
    | IStopDeployment
    | ISubscribeStatValues
    | IToggleDeploymentObject;
