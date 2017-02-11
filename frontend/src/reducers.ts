import {ISetStatusAction, IAction, ACTION} from '../../shared/actions'
import {IStatus, IStatuses} from '../../shared/status'
import {Reducer, combineReducers} from 'redux';


export interface IMainState {
    status: IStatuses;
}

function status(state: IStatuses = {} , action: IAction) {
    switch (action.type) {
    case ACTION.SetStatus:
        let x:IStatuses = {};
        x[action.name] = action.status;
        return Object.assign(x, state);
    default:
        return state;
    }  
}

export const mainReducer = combineReducers(
    {status: status});