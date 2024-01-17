import { Job } from './job';
import * as message from './messages';

export abstract class JobOwner {
    jobs: { [id: number]: Job } = {};

    addJob(job: Job) {
        this.jobs[job.id] = job;
    }

    removeJob(job: Job, msg: message.Failure | message.Success | null) {
        delete this.jobs[job.id];
    }

    kill() {
        for (const id in this.jobs) {
            const job = this.jobs[+id];
            if ((job.client as JobOwner) == this) job.client = null;
            if (job.owner == this) job.owner = null;
            job.kill(null);
        }
    }
}
