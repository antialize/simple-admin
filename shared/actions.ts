import {IStatus, IStatusUpdate} from './status';
import {IPage, INameIdPair, IObject} from './state';

export enum ACTION {UpdateStatus, SetPage, SetObjectListFilter, SetInitialState, FetchObject, ObjectChanged, SetServiceListFilter, PokeService}


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

export interface ISetInitialState {
    type: ACTION.SetInitialState;
    objectNamesAndIds: {[cls:string]:INameIdPair[]};
    statuses: {[id:number]: IStatus};
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

export type IAction = IUpdateStatusAction | ISetPageAction | ISetObjectListFilter | ISetInitialState | IFetchObject | IObjectChanged | ISetServiceListFilter | IPokeService;