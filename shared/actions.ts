import { IStatus, IStatusUpdate } from './status';
import { IPage, IObjectDigest, IObject2, DEPLOYMENT_OBJECT_STATUS, DEPLOYMENT_STATUS, IDeploymentObject } from './state';
import { IType } from './type'

export enum ACTION {
    UpdateStatus, SetPage, SetObjectListFilter, SetInitialState, FetchObject, ObjectChanged,
    SetServiceListFilter, PokeService, StartLog, AddLogLines, EndLog, SetServiceLogVisibility,
    AddMessage, SetMessagesDismissed, SetObjectName, SetObjectComment, SetObjectCatagory, SetObjectContentParam, DiscardObject, SaveObject,
    HostDown, Alert,
    DeployObject, SetDeploymentStatus, SetDeploymentMessage, SetDeploymentObjects, ClearDeploymentLog, AddDeploymentLog, SetDeploymentObjectStatus, ToggleDeploymentObject, DeleteObject,
    StopDeployment, StartDeployment, CancelDeployment, SetConnectionStatus, SetMessageExpanded, SetMessageGroupExpanded, QueryStats, QueryStatsAnswer, MessageTextReq, MessageTextRep,
    AuthStatus, Login, Logout, RequestAuthStatus, SetLoginUsername, SetLoginPassword, SetLoginOtp, RequestInitialState
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

export interface ISetObjectListFilter {
    type: ACTION.SetObjectListFilter;
    objectType: number;
    filter: string;
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

export interface ISetServiceListFilter {
    type: ACTION.SetServiceListFilter;
    host: number;
    filter: string;
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

export interface ISetServiceLogVisibilty {
    type: ACTION.SetServiceLogVisibility;
    host: number;
    service: string;
    visibility: boolean;
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

// Object actions
export interface ISetObjectName {
    type: ACTION.SetObjectName;
    id: number;
    name: string;
}

export interface ISetObjectComment {
    type: ACTION.SetObjectComment;
    id: number;
    comment: string;
}

export interface ISetObjectCatagory {
    type: ACTION.SetObjectCatagory;
    id: number;
    catagory: string;
}

export interface ISetObjectContentParam {
    type: ACTION.SetObjectContentParam;
    id: number;
    param: string;
    value: any;
}

export interface IDiscardObject {
    type: ACTION.DiscardObject;
    id: number;
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
    

export interface ISetConnectionStatus {
    type: ACTION.SetConnectionStatus;
    status: CONNECTION_STATUS;
}

export interface ISetMessageExpanded {
    type: ACTION.SetMessageExpanded;
    id: number;
    expanded: boolean;
}

export interface ISetMessageGroupExpanded {
    type: ACTION.SetMessageGroupExpanded;
    id: number;
    expanded: boolean;
}

export interface IQueryStats {
    type: ACTION.QueryStats;
    qs: {
        start: number;
        step: number;
        values: {qid:number, name:string}[];
    }[];
}

export interface IQueryStatsAnswer {
    type: ACTION.QueryStatsAnswer;
    answers: {id:number, values:number[]}[];
};

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
    forgetPwd: string;
    forgetOtp: string;
}

export interface ISetLoginUsername {
    type: ACTION.SetLoginUsername;
    value: string;
}
export interface ISetLoginPassword {
    type: ACTION.SetLoginPassword;
    value: string;    
}
export interface ISetLoginOtp {
    type: ACTION.SetLoginOtp;
    value: string;
}

export interface IRequestInitialState {
    type: ACTION.RequestInitialState;
}
export type IAction = IUpdateStatusAction | ISetPageAction | ISetObjectListFilter | ISetInitialState
    | IFetchObject | IObjectChanged | ISetServiceListFilter | IPokeService | IStartLog | IEndLog
    | IAddLogLines | ISetServiceLogVisibilty | IAddMessage | ISetMessagesDismissed | ISetObjectName 
    | ISetObjectComment | ISetObjectContentParam | IDiscardObject | ISaveObject | IDeleteObject | IHostDown
    | IDeployObject | ISetDeploymentStatus | ISetDeploymentMessage | ISetDeploymentObjects | IClearDeploymentLog
    | IAddDeploymentLog | ISetDeploymentObjectStatus | IToggleDeploymentObject | IStopDeployment
    | IStartDeployment | IStartDeployment | ICancelDeployment | IAlert | ISetObjectCatagory
    | ISetConnectionStatus | ISetMessageExpanded | ISetMessageGroupExpanded | IQueryStats | IQueryStatsAnswer
    | IMessageTextReqAction | IMessageTextRepAction | IAuthStatus | IRequestAuthStatus | ILogin | ILogout
    | ISetLoginUsername | ISetLoginPassword | ISetLoginOtp | IRequestInitialState;
