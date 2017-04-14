import {IStatus, IStatusUpdate} from './status';
import {IPage, INameIdPair, IObject} from './state';

export enum ACTION {UpdateStatus, SetPage, SetObjectListFilter, SetInitialState, FetchObject, ObjectChanged, SetServiceListFilter, PokeService, StartLog, AddLogLines, EndLog,
                    SetServiceLogVisibility, AddMessage, SetMessageDismissed, SetObjectName, SetObjectContentParam, DiscardObject, SaveObject}

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
    object: IObject[];
}

export interface ISetPageAction {
    type: ACTION.SetPage;    
    page: IPage;
}

export interface ISetObjectListFilter {
    type: ACTION.SetObjectListFilter;
    class: string;
    filter: string;
}

export interface IMessage {
    id: number;
    host: number | null;
    type: string;
    subtype: string | null;
    message: string;
    time: number;
    url: string;
    dismissed: boolean;
}

export interface ISetInitialState {
    type: ACTION.SetInitialState;
    objectNamesAndIds: {[cls:string]:INameIdPair[]};
    statuses: {[id:number]: IStatus};
    messages: IMessage[];
}

export interface ISetServiceListFilter {
    type: ACTION.SetServiceListFilter;
    host: number;
    filter: string;   
}

export enum SERVICE_POKE {Start, Stop, Restart, Reload}

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

export interface ISetMessageDismissed {
    type: ACTION.SetMessageDismissed,
    id: number,
    dismissed: boolean
    source: "server" | "webclient";
}

// Object actions
export interface ISetObjectName {
    type: ACTION.SetObjectName;
    id: number;
    name: string;
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
    obj?: IObject;
}

export type IAction = IUpdateStatusAction | ISetPageAction | ISetObjectListFilter | ISetInitialState 
    | IFetchObject | IObjectChanged | ISetServiceListFilter | IPokeService | IStartLog | IEndLog 
    | IAddLogLines | ISetServiceLogVisibilty | IAddMessage | ISetMessageDismissed | ISetObjectName | ISetObjectContentParam | IDiscardObject | ISaveObject;