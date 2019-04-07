import { IStatus, IStatusUpdate } from './status';
import { IPage, IObjectDigest, IObject2, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_STATUS, IDeploymentObject } from './state';
import { IType } from './type'

export enum ACTION {
    AddDeploymentLog,
    AddLogLines,
    AddMessage,
    Alert,
    AuthStatus,
    CancelDeployment,
    ClearDeploymentLog,
    DeleteObject,
    DeployObject,
    EndLog,
    FetchObject,
    HostDown,
    Login,
    Logout,
    MessageTextRep,
    MessageTextReq,
    ObjectChanged,
    PokeService,
    RequestAuthStatus,
    RequestInitialState,
    RequestStatBucket,
    SaveObject,
    SetDeploymentMessage,
    SetDeploymentObjects,
    SetDeploymentObjectStatus,
    SetDeploymentStatus,
    SetInitialState,
    SetMessagesDismissed,
    SetPage,
    StartDeployment,
    StartLog,
    StatBucket,
    StatValueChanges,
    StopDeployment,
    SubscribeStatValues,
    ToggleDeploymentObject,
    UpdateStatus,
}

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
    url: string;
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

export enum SERVICE_POKE { Start, Stop, Restart, Reload, Kill }

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
    index: number;
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

export enum CONNECTION_STATUS {CONNECTING, CONNECTED, AUTHENTICATING, LOGIN, INITING, INITED, WAITING};
    
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
    message: string;
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
    values: number[];
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
    | IEndLog
    | IFetchObject
    | IHostDown
    | ILogin
    | ILogout
    | IMessageTextRepAction
    | IMessageTextReqAction
    | IObjectChanged
    | IPokeService
    | IRequestAuthStatus
    | IRequestInitialState
    | IRequestStatBucket
    | ISaveObject
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
    | IStatBucket
    | IStatValueChanges
    | IStopDeployment
    | ISubscribeStatValues
    | IToggleDeploymentObject
    | IUpdateStatusAction
    ;
