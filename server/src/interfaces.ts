import * as message from './messages'
import {IAction} from '../../shared/actions'
import {IStatusUpdate} from '../../shared/status'

export interface IJob {
    id: number;
    client: IHostClient;
    owner: IJobOwner;

    handleMessage: (obj: message.Incomming) => void;
    kill: (msg: message.Failure|message.Success|null) => void;
}

export interface IJobOwner {
    jobs: {[id:number]: IJob};
    addJob: (job:IJob) => void;
    removeJob: (job:IJob, msg: message.Failure|message.Success|null) => void;
    kill: () => void;
}

export interface IHostClient extends IJobOwner {
    nextJobId: number;
    hostname: string;
    sendMessage(obj:message.Outgoing);
    updateStatus(update: IStatusUpdate);
}

export interface IWebClient extends IJobOwner {
    logJobs: {[id: number]: IJob};
    sendMessage: (obj:IAction) => void;
}


