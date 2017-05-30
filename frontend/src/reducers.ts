import { IUpdateStatusAction, IAction, ACTION, IMessage } from '../../shared/actions'
import { IStatus, IStatuses, IStatusUpdate, applyStatusUpdate } from '../../shared/status'
import { Reducer, combineReducers } from 'redux';
import { IPage, PAGE_TYPE, IObject, INameIdPair, IHostContent, IUserContent, IGroupContent, IFileContent, ICollectionContent, IRootContent, DEPLOYMENT_STATUS, IDeploymentObject } from '../../shared/state'

export interface IObjectState {
    current: IObject | null;
    versions: { [version: number]: IObject };
    touched: boolean;
}

export interface IDeploymentState {
    status: DEPLOYMENT_STATUS;
    log: string[];
    logClearCount: number;
    objects: IDeploymentObject[];
    message: string;
}

export interface IMainState {
    status: IStatuses;
    page: IPage;
    objectListFilter: { [cls: string]: string };
    serviceListFilter: { [host: number]: string };
    objectNamesAndIds: { [cls: string]: INameIdPair[] };
    objects: { [id: number]: IObjectState };
    loaded: boolean;
    serviceLogVisibility: { [host: number]: { [name: string]: boolean } }
    messages: { [id: number]: IMessage };
    deployment: IDeploymentState;
};

function messages(state: { [id: number]: IMessage } = {}, action: IAction) {
    switch (action.type) {
        case ACTION.SetInitialState: {
            const messages: { [id: number]: IMessage } = {};
            for (const msg of action.messages)
                messages[msg.id] = msg;
            return messages;
        }
        case ACTION.SetMessageDismissed: {
            const messages = Object.assign({}, state);
            messages[action.id] = Object.assign({}, messages[action.id]);
            messages[action.id].dismissed = action.dismissed;
            return messages;
        }
        case ACTION.AddMessage: {
            const messages = Object.assign({}, state);
            messages[action.message.id] = action.message;
            return messages;
        }
    }
    return state;
}

function serviceLogVisibility(state: { [host: number]: { [name: string]: boolean } } = {}, action: IAction) {
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

function serviceListFilter(state: { [host: number]: string } = {}, action: IAction) {
    switch (action.type) {
        case ACTION.SetServiceListFilter:
            const ns = Object.assign({}, state);
            ns[action.host] = action.filter;
            return ns;
        default:
            return state;
    }
}

function loaded(state = false, action: IAction) {
    switch (action.type) {
        case ACTION.SetInitialState:
            return true;
        default:
            return state;
    }
}

function objectNamesAndIds(state: { [cls: string]: INameIdPair[] } = {}, action: IAction) {
    switch (action.type) {
        case ACTION.SetInitialState:
            return action.objectNamesAndIds;
        case ACTION.ObjectChanged:
            const s2 = Object.assign({}, state);
            if (action.object.length == 0) {
               for (let cls in s2) {
                    if (s2[cls].findIndex(v => v.id == action.id) == -1) continue;
                    s2[cls] = s2[cls].filter(v=> v.id != action.id);
               }
            } else {
                let version = -1;
                let name = "";
                let catagory = "";
                let cls = "";
                for (const ob of action.object) {
                    if (ob.version < version) continue;
                    version = ob.version;
                    name = ob.name;
                    cls = ob.class;
                    catagory = ob.catagory;
                }
                if (!(cls in s2)) s2[cls] = [];
                else s2[cls] = s2[cls].filter((v) => v.id != action.id);
                s2[cls].push({ id: action.id, name, catagory});
            }
            return s2;
        default:
            return state;
    }
}

function objects(state: { [id: number]: IObjectState } = {}, action: IAction): { [id: number]: IObjectState } {
    switch (action.type) {
        case ACTION.ObjectChanged:
            let ret = Object.assign({}, state);
            if (action.object.length == 0) { //The object was deleted
                if (action.id in ret)
                    delete ret[action.id];
            } else {
                if (action.id in ret)
                    ret[action.id].versions = Object.assign({}, ret[action.id].versions);
                else
                    ret[action.id] = { current: null, versions: {}, touched: false };
                for (const obj of action.object)
                    ret[action.id].versions[obj.version] = obj;
            }
            return ret;
        case ACTION.DiscardObject:
            if (!(action.id in state)) return state;
            let ret2 = Object.assign({}, state);
            ret2[action.id] = { current: null, versions: state[action.id].versions, touched: false };
            return ret2;
        case ACTION.SetObjectName:
            if (!(action.id in state)) return state;
            let ret3 = Object.assign({}, state);
            ret3[action.id] = Object.assign({}, ret3[action.id]);
            ret3[action.id].current = Object.assign({}, ret3[action.id].current);
            ret3[action.id].current.name = action.name;
            ret3[action.id].touched = true;
            return ret3;
        case ACTION.SetObjectContentParam:
            if (!(action.id in state)) return state;
            let ret4 = Object.assign({}, state);
            ret4[action.id] = Object.assign({}, ret4[action.id]);
            ret4[action.id].current = Object.assign({}, ret4[action.id].current);
            ret4[action.id].current.content = Object.assign({}, ret4[action.id].current.content);
            (ret4[action.id].current.content as { [key: string]: any })[action.param] = action.value;
            ret4[action.id].touched = true;
            return ret4;
        case ACTION.SaveObject:
            if (!(action.id in state)) return state;
            let ret5 = Object.assign({}, state);
            ret5[action.id] = Object.assign({}, ret5[action.id], {touched: false});
            return ret5;
        case ACTION.SetObjectCatagory:
            if (!(action.id in state)) return state;
            let ret6 = Object.assign({}, state);
            ret6[action.id] = Object.assign({}, ret6[action.id]);
            ret6[action.id].current = Object.assign({}, ret6[action.id].current);
            ret6[action.id].current.catagory = action.catagory;
            ret6[action.id].touched = true;
            return ret6;
        default:
            return state;
    }
}

function objectListFilter(state: { [cls: string]: string } = {}, action: IAction) {
    switch (action.type) {
        case ACTION.SetObjectListFilter:
            let x: { [cls: string]: string } = {};
            x[action.class] = action.filter;
            return Object.assign({}, state, x);
        default:
            return state;
    }
}

function status(state: IStatuses = {}, action: IAction) {
    switch (action.type) {
        case ACTION.UpdateStatus:
            let x: IStatuses = {};
            let old = null;
            if (action.host in state)
                old = state[action.host];
            x[action.host] = applyStatusUpdate(old, action.update);
            x[action.host].up = true;
            return Object.assign({}, state, x);
        case ACTION.HostDown:
            if (!(action.id in state)) return state;
            let y = Object.assign({}, state);
            y[action.id] = Object.assign({}, y[action.id]);
            y[action.id].up = false;
            break;
        case ACTION.SetInitialState:
            return action.statuses;
        default:
            return state;
    }
}

function page(state: IPage = { type: PAGE_TYPE.Dashbord }, action: IAction) {
    switch (action.type) {
        case ACTION.SetPage:
            return action.page;
        default:
            return state;
    }
}

function changeCurrentObject(state: IMainState) {
    if (state.page.type != PAGE_TYPE.Object) return; // We are not viewing an object
    let id = state.page.id;
    let current: IObject = null;
    if (id >= 0) { // We are modifying an existing object
        if (!(id in state.objects)) return; // The object has not been loaded
        if (state.page.version == null) {
            // We have no version so lets pick the newest
            state.page = Object.assign({}, state.page);
            state.page.version = 1;
            for (let v in state.objects[id].versions)
                state.page.version = Math.max(state.page.version, +v);
        }
        if (state.objects[id].current != null && state.objects[id].current.version == state.page.version)
            return; //We are allready modifying the right object
        current = state.objects[id].versions[state.page.version];
    } else { // We are modifying a new object
        if (state.page.id in state.objects && state.objects[id].current != null) return; //We are allready modifying the right object
        // We need to create a new object
        current = {
            class: state.page.class,
            name: "",
            version: null,
            content: {} as ICollectionContent,
            catagory: "",
        }
        switch (state.page.class) {
            case "host":
                current.content = { password: "", messageOnDown: true, importantServices: [] } as IHostContent;
                break;
            case "user":
                current.content = { firstName: "", lastName: "", system: false, sudo: false, password: "", email: "", groups: "", shell: "/bin/bash" } as IUserContent;
                break;
            case "group":
                current.content = { system: false } as IGroupContent;
                break;
            case "file":
                current.content = { path: "", user: "", group: "", mode: "644", data: "", lang: null } as IFileContent;
                break;
        }
    }
    state.objects = Object.assign({}, state.objects);
    if (id in state.objects)
        state.objects[id] = Object.assign({}, state.objects[id], { current: current });
    else
        state.objects[id] = {touched:false, current: current, versions: {} }
}

export function deployment(state: IDeploymentState = { status: DEPLOYMENT_STATUS.Done, log: [], objects: [], message: "", logClearCount: 0 }, action: IAction) {
    switch (action.type) {
        case ACTION.SetDeploymentStatus:
            return Object.assign({}, state, { status: action.status });
        case ACTION.SetDeploymentMessage:
            return Object.assign({}, state, { message: action.message });
        case ACTION.SetDeploymentObjects:
            return Object.assign({}, state, { objects: action.objects });
        case ACTION.ClearDeploymentLog:
            return Object.assign({}, state, { log: [], logClearCount: state.logClearCount + 1 });
        case ACTION.AddDeploymentLog:
            return Object.assign({}, state, { log: state.log.concat([action.bytes]) });
        case ACTION.SetDeploymentObjectStatus:
            let x = state.objects.slice(0);
            x[action.index] = Object.assign({}, x[action.index], { status: action.status });
            return Object.assign({}, state, { objects: x });
        case ACTION.ToggleDeploymentObject:
            let y = state.objects.slice(0);
            y[action.index] = Object.assign({}, y[action.index], { enabled: action.enabled });
            return Object.assign({}, state, { objects: y });
        case ACTION.SetInitialState:
            return { status: action.deploymentStatus, log: action.deploymentLog ? action.deploymentLog : [], objects: action.deploymentObjects, message: action.deploymentMessage, logClearCount: 0 };
    }
    return state;
}

export function mainReducer(state: IMainState = null, action: IAction) {
    let ns: IMainState = {
        status: status(state ? state.status : undefined, action),
        page: page(state ? state.page : undefined, action),
        objectListFilter: objectListFilter(state ? state.objectListFilter : undefined, action),
        objectNamesAndIds: objectNamesAndIds(state ? state.objectNamesAndIds : undefined, action),
        objects: objects(state ? state.objects : undefined, action),
        loaded: loaded(state ? state.loaded : undefined, action),
        serviceListFilter: serviceListFilter(state ? state.serviceListFilter : undefined, action),
        messages: messages(state ? state.messages : undefined, action),
        serviceLogVisibility: serviceLogVisibility(state ? state.serviceLogVisibility : undefined, action),
        deployment: deployment(state ? state.deployment : undefined, action),
    };
    changeCurrentObject(ns);
    return ns;
}
