import {  IAction, ACTION, IMessage} from '../../shared/actions'
import {  IStatuses,  applyStatusUpdate } from '../../shared/status'
import { IObjectDigest,  IObject2 } from '../../shared/state'
import { IType, typeId, TypePropType } from '../../shared/type'

export interface IMainState {
    status: IStatuses;
};

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

export function mainReducer(state: IMainState = null, action: IAction) {
    let ns: IMainState = {
        status: status(state ? state.status : undefined, action),
    }
    return ns;
}
