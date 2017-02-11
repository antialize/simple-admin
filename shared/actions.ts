import {IStatus} from './status';

export enum ACTION {SetStatus}

export interface ISetStatusAction {
    type: ACTION.SetStatus;
    name: string;
    status: IStatus;
}

export type IAction = ISetStatusAction;