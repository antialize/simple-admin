import * as message from './messages'
import {IJob, IJobOwner, IHostClient} from './interfaces'

export class JobOwner implements IJobOwner {
    jobs: {[id:number]: IJob} = {};

    addJob(job:IJob) {
        this.jobs[job.id] = job;
    }

    removeJob(job:IJob, msg: message.Failure|message.Success|null) {
        delete this.jobs[job.id];
    }

    kill() {
        for (const id in this.jobs) {
            const job = this.jobs[+id]
            if (job.client as IJobOwner == this) job.client = null;
            if (job.owner == this) job.owner = null;
            job.kill(null);
        }
    }
}

export abstract class Job implements IJob {
    id: number;
    running: boolean = false;

    constructor(public client: IHostClient, id:number = null, public owner:JobOwner = null) {
        if (id === null)
            this.id = client.nextJobId++;
        else
            this.id = id;
        this.client.jobs[this.id] = this;
        if (this.owner !== null) this.owner.jobs[this.id] = this;
    }
    
   handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'success':
            this.running = false;
            this.kill(obj);
            break;    
        case 'failure':
            this.running = false;
            this.kill(obj);
            break;
        }
    }

    kill(msg: message.Failure|message.Success|null = null) {
        if (this.client !== null) {
            if (this.running) {
                let msg: message.Kill = {'type': 'kill', 'id': this.id}
                this.client.sendMessage(msg);
            }
            this.client.removeJob(this, msg);
            this.client = null;
        }
        if (this.owner !== null) {
            this.owner.removeJob(this, msg);
            this.owner = null;
        }
    }
}
