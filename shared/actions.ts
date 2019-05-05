import { IStatus, IStatusUpdate } from './status';
import { IPage, IObjectDigest, IObject2, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_STATUS, IDeploymentObject } from './state';
import { IType } from './type'

export enum ACTION {
    AddDeploymentLog="AddDeploymentLog",
    AddLogLines="AddLogLines",
    AddMessage="AddMessage",
    Alert="Alert",
    AuthStatus="AuthStatus",
    CancelDeployment="CancelDeployment",
    ClearDeploymentLog="ClearDeploymentLog",
    DeleteObject="DeleteObject",
    DeployObject="DeployObject",
    DockerContainerRemove="DockerContainerRemove",
    DockerContainerStart="DockerContainerStart",
    DockerContainerStop="DockerContainerStop",
    DockerDeployDone="DockerDeployEnd",
    DockerDeployLog="DockerDeployLog",
    DockerDeployStart="DockerDeployStart",
    DockerDeploymentsChanged="DockerDeploymentsChanged",
    DockerImageSetPin="DockerImageSetPin",
    DockerListDeploymentHistory="DockerListDeploymentHistory",
    DockerListDeploymentHistoryRes="DockerListDeploymentHistoryRes",
    DockerListDeployments="DockerListDeployments",
    DockerListDeploymentsRes="DockerListDeploymentsRes",
    DockerListImageTagHistory="DockerListImageTagHistory",
    DockerListImageTagHistoryRes="DockerListImageTagHistoryRes",
    DockerListImageTags="DockerListImageTags",
    DockerListImageTagsChanged="DockerListImageTagsChanged",
    DockerListImageTagsRes="DockerListImageTagsRes",
    EndLog="EndLog",
    FetchObject="FetchObject",
    GetObjectId="GetObjectId",
    GetObjectIdRes="GetObjectIdRes",
    HostDown="HostDown",
    ListModifiedFiles="ListModifiedFiles",
    Login="Login",
    Logout="LogOut",
    MessageTextRep="MessageTextRep",
    MessageTextReq="MessageTextReq",
    ModifiedFilesChanged="ModifiedFilesChanged",
    ModifiedFilesList="ModifiedFilesList",
    ModifiedFilesResolve="ModifiedFilesResolve",
    ModifiedFilesScan="ModifiedFilesScan",
    ObjectChanged="ObjectChanged",
    PokeService="PokeService",
    RequestAuthStatus="RequestAuthStatus",
    RequestInitialState="RequestInitialState",
    RequestStatBucket="RequestStatBucket",
    SaveObject="SaveObject",
    SetDeploymentMessage="SetDeploymentMessage",
    SetDeploymentObjectStatus="SetDeploymentObjectStatus",
    SetDeploymentObjects="SetDeploymentObjects",
    SetDeploymentStatus="SetDeploymentStatus",
    SetInitialState="SetInitialState",
    SetMessagesDismissed="SetMessageDismissed",
    SetPage="SetPage",
    StartDeployment="StartDeployment",
    StartLog="StartLog",
    StatBucket="StatBucket",
    StatValueChanges="StatValueChanges",
    StopDeployment="StopDeployment",
    SubscribeStatValues="SubscribeStatValues",
    ToggleDeploymentObject="ToggleDeploymentObject",
    UpdateStatus="UpdateStatus",
}

export type Ref = number | string;

export interface IUpdateStatusAction {
    type: ACTION.UpdateStatus;
    host: number;
    update: IStatusUpdate
}

export interface IFetchObject {
    type: ACTION.FetchObject;
    id: number;
}

export interface IObjectChanged {
    type: ACTION.ObjectChanged;
    id: number;
    object: IObject2<any>[];
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
    objectNamesAndIds: { [cls: string]: IObjectDigest[] };
    statuses: { [id: number]: IStatus };
    messages: IMessage[];
    deploymentObjects: IDeploymentObject[];
    deploymentStatus: DEPLOYMENT_STATUS;
    deploymentMessage: string;
    deploymentLog: string[];
    types: { [id:number]: IObject2<IType>};
}

export enum SERVICE_POKE { 
    Start="Start", 
    Stop="Stop", 
    Restart="Restart",
    Reload="Reload", 
    Kill="Kill" 
}

export interface IPokeService {
    type: ACTION.PokeService;
    host: number;
    poke: SERVICE_POKE;
    service: string;
}

export interface IStartLog {
    type: ACTION.StartLog;
    host: number;
    logtype: 'file' | 'dmesg' | 'journal'
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
};

export interface IMessageTextRepAction {
    type: ACTION.MessageTextRep;
    id: number;
    message: string;
};

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

export interface IHostDown {
    type: ACTION.HostDown;
    id: number;
}

export interface IDeployObject {
    type: ACTION.DeployObject;
    id: number;
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
    session: string;
}

export interface IAuthStatus {
    type: ACTION.AuthStatus;
    session: string | null;
    user: string;
    pwd: boolean;
    otp: boolean;
    message: string | null;
};

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

export interface IRequestStatBucket {
    type: ACTION.RequestStatBucket;
    target: number;
    host: number;
    name: string;
    index: number;
    level: number;
}

export interface IStatBucket {
    type: ACTION.StatBucket;
    target: number;
    host: number;
    name: string;
    index: number;
    level: number;
    values: number[] | null;
}

export interface ISubscribeStatValues {
    type: ACTION.SubscribeStatValues;
    target: number;
    host: number;
    values: string[];
};

export interface IStatValueChanges {
    type: ACTION.StatValueChanges;
    target: number;
    host: number;
    name: string;
    value: number;
    level: number;
    index: number;
};

export interface IDockerDeployStart {
    type: ACTION.DockerDeployStart;
    host: number | string;
    image: string;
    container?: string;
    config?: string;
    restoreOnFailure: boolean;
    ref: Ref;
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
    labels: {[key: string]: string};
    removed: number | null;
}

export interface IDockerListImageTagsRes {
    type: ACTION.DockerListImageTagsRes;
    ref: Ref;
    tags: DockerImageTag[];
}

export interface IDockerImageTagsCharged {
    type: ACTION.DockerListImageTagsChanged;
    changed: DockerImageTag[];
    removed: {image: string, hash:string}[];
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
    hash: string;
    name: string;
    user: string;
    start: number;
    end: number | null
    host: number;
    state?: string;
    config: string;
}

export interface IDockerListDeploymentsRes {
    type: ACTION.DockerListDeploymentsRes;
    ref: Ref;
    deployments: DockerDeployment[];
}

export interface IDockerDeploymentsChanged {
    type: ACTION.DockerDeploymentsChanged;
    changed: DockerDeployment[];
    removed: {host:number, name:string}[];
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

export interface IDockerImageSetPin {
    type: ACTION.DockerImageSetPin;
    id: number;
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
    newCurrent: string;
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
    | IDockerContainerRemove
    | IDockerContainerStart
    | IDockerContainerStop
    | IDockerDeployDone
    | IDockerDeployLog
    | IDockerDeployStart
    | IDockerDeploymentsChanged
    | IDockerImageSetPin
    | IDockerImageTagsCharged
    | IDockerListDeploymentHistory
    | IDockerListDeploymentHistoryRes
    | IDockerListDeployments
    | IDockerListDeploymentsRes
    | IDockerListImageTagHistory
    | IDockerListImageTagHistoryRes
    | IDockerListImageTags
    | IDockerListImageTagsRes
    | IEndLog
    | IFetchObject
    | IGetObjectId
    | IGetObjectIdRes
    | IHostDown
    | ILogin
    | ILogout
    | IMessageTextRepAction
    | IMessageTextReqAction
    | IModifiedFilesChanged
    | IModifiedFilesList
    | IModifiedFilesScan
    | IObjectChanged
    | IPokeService
    | IRequestAuthStatus
    | IRequestInitialState
    | IRequestStatBucket
    | ISaveObject
    | ISetDeploymentMessage
    | ISetDeploymentObjectStatus
    | ISetDeploymentObjects
    | ISetDeploymentStatus
    | ISetInitialState
    | ISetMessagesDismissed
    | ISetPageAction
    | IStartDeployment
    | IStartDeployment
    | IStartLog
    | IStatBucket
    | IStatValueChanges
    | IStopDeployment
    | ISubscribeStatValues
    | IToggleDeploymentObject
    | IUpdateStatusAction
    | IModifiedFilesResolve;
