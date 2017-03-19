import {IUpdateStatusAction, IAction, ACTION} from '../../shared/actions'
import {IStatus, IStatuses, IStatusUpdate, applyStatusUpdate} from '../../shared/status'
import {Reducer, combineReducers} from 'redux';
import {IPage, PAGE_TYPE, IObject, INameIdPair} from '../../shared/state'

export interface IMainState {
    status: IStatuses;
    page: IPage;
    objectListFilter: {[cls:string]:string};
    serviceListFilter: {[host:number]:string};
    objectNamesAndIds: {[cls:string]:INameIdPair[]};
    objects: {[id:number]:{[version:number]:IObject}};
    loaded: boolean;
    serviceLogVisibility: {[host:number]: {[name:string]: boolean}}
};

function serviceLogVisibility(state: {[host:number]: {[name:string]: boolean}} = {}, action: IAction) {
    switch (action.type) {
    case ACTION.SetServiceLogVisibility: 
        const s2 = Object.assign({}, state);
        s2[action.host] = Object.assign({}, s2[action.host] || {});
        s2[action.host][action.service] = action.visibility;
        return s2;
    default:
        return state;
    }
}

function serviceListFilter(state:{[host:number]:string} = {}, action: IAction) {
    switch(action.type) {
    case ACTION.SetServiceListFilter:
        const ns = Object.assign({}, state);
        ns[action.host] = action.filter;
        return ns;
    default:
        return state;
    }
}

function loaded(state=false, action:IAction) {
    switch(action.type) {
    case ACTION.SetInitialState:
        return true;
    default:
        return state;
    }   
}

function objectNamesAndIds(state = {}, action:IAction) {
    switch(action.type) {
    case ACTION.SetInitialState:
        return action.objectNamesAndIds;
    default:
        return state;
    }
}

function objects(state = {}, action:IAction) {
    switch(action.type) {
    case ACTION.ObjectChanged:
        let ret: {[id:number]:{[version:number]:IObject}} = {};
        ret[action.id] = {};
        ret = Object.assign(ret, state);
        ret[action.id] = Object.assign({}, ret[action.id]);
        for (const obj of action.object)
            ret[action.id][obj.version] = obj;
        return ret;
    default:
        return state;
    }
}

function objectListFilter(state: {[cls:string]:string} = {}, action:IAction) {
    switch(action.type) {
    case ACTION.SetObjectListFilter:
        let x: {[cls:string]:string} = {};
        x[action.class] = action.filter;
        return Object.assign({}, state, x);
    default:
        return state;
    }
}

function status(state: IStatuses = {} , action: IAction) {
    switch (action.type) {
    case ACTION.UpdateStatus:
        let x:IStatuses = {};
        let old = null;
        if (action.host in state)
            old = state[action.host];
        x[action.host] = applyStatusUpdate(old, action.update);
        return Object.assign({}, state, x);
    case ACTION.SetInitialState:
        return action.statuses;
    default:
        return state;
    }  
}

function page(state: IPage = {type: PAGE_TYPE.Dashbord} , action: IAction) {
    switch (action.type) {
    case ACTION.SetPage:
        return action.page;
    default:
        return state;
    }  
}

export const mainReducer = combineReducers(
    {status,
    page,
    objectListFilter,
    objectNamesAndIds,
    objects,
    loaded,
    serviceListFilter,
    serviceLogVisibility
    });