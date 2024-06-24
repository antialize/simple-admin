import type { HostClient } from "./hostclient";
import type { JobOwner } from "./jobowner";
import type * as message from "./messages";

export abstract class Job {
    id: number;
    running = false;
    client: HostClient | null;
    constructor(
        client: HostClient,
        id: number | null = null,
        public owner: JobOwner | null = null,
    ) {
        this.client = client;
        if (id === null) this.id = client.nextJobId++;
        else this.id = id;
        this.client.jobs[this.id] = this;
        if (this.owner !== null) this.owner.jobs[this.id] = this;
    }

    handleMessage(obj: message.Incomming) {
        switch (obj.type) {
            case "success":
                this.running = false;
                this.kill(obj);
                break;
            case "failure":
                this.running = false;
                this.kill(obj);
                break;
        }
    }

    kill(msg: message.Failure | message.Success | null = null) {
        if (this.client !== null) {
            if (this.running) {
                const msg: message.Kill = { type: "kill", id: this.id };
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
