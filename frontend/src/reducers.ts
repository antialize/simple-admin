import {  IAction, ACTION, IMessage} from '../../shared/actions'
import {  IStatuses,  applyStatusUpdate } from '../../shared/status'
import { IObjectDigest,  IObject2 } from '../../shared/state'
import { IType, typeId, TypePropType } from '../../shared/type'

function fillDefaults(content:{[key:string]:any}, type: IType) {
    if (type.hasVariables && !('variables' in content)) content['variables'] = [];
    if (type.hasContains && !('contains' in content))content['contains'] = [];
    if (type.hasSudoOn && !('sudoOn' in content)) content['sudoOn'] = [];
    if (type.hasSudoOn && !('triggers' in content)) content['triggers'] = [];
    if (type.hasDepends && !('depends' in content)) content['depends'] = [];
    for (const item of type.content || []) {
        switch (item.type) {
        case TypePropType.bool:
        case TypePropType.choice:
        case TypePropType.text:
            if (!(item.name in content)) content[item.name] = item.default;
            break;
        case TypePropType.document:
            if (item.langName && !(item.langName in content)) content[item.langName] = "";
            if (!(item.name in content)) content[item.name] = "";
            break;
        case TypePropType.password:
            if (!(item.name in content))
                content[item.name] = Array.from((window as any).crypto.getRandomValues(new Uint8Array(18)), (byte:number) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
            break;
        case TypePropType.none:
            break;
        case TypePropType.typeContent:
            if (!(item.name in content)) content[item.name] = [];
        }
    }
}

export interface IMainState {
    status: IStatuses;
};

/*
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
 

        default:
            return state;
    }
}
*/

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


function changeCurrentObject(state: IMainState) {
    //TODO FIX THIS
    /*if (state.page.type != PAGE_TYPE.Object) return; // We are not viewing an object
    let id = state.page.id;
    let current: IObject2<any> = null;
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
        current = Object.assign(state.objects[id].versions[state.page.version]);
    } else { // We are modifying a new object
        if (state.page.id in state.objects && state.objects[id].current != null) return; //We are allready modifying the right object
        // We need to create a new object
        current = {id: id, type: state.page.objectType, name:"", version: null, catagory: "", content: {}, comment: ""};
    }

    current.content = Object.assign({}, current.content);
    fillDefaults(current.content, state.types[state.page.objectType].content);

    state.objects = Object.assign({}, state.objects);
    if (id in state.objects)
        state.objects[id] = Object.assign({}, state.objects[id], { current: current });
    else
        state.objects[id] = { touched: false, current: current, versions: {} }*/
}


export function mainReducer(state: IMainState = null, action: IAction) {
    let ns: IMainState = {
        status: status(state ? state.status : undefined, action),
    }
    changeCurrentObject(ns);
    return ns;
}
