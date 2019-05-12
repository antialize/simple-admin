import {Job} from '../job'
import {HostClient} from '../hostclient'
import * as message from '../messages'
import * as fs from 'fs';
import {IStatusUpdate} from '../../../shared/status'
import { docker } from '../docker';
import nullCheck from '../../../shared/nullCheck';

export class MonitorJob extends Job {
    constructor(client: HostClient, script: string|null) {
        super(client, 0, null);
        let msg: message.RunScript = {
            'type': 'run_script', 
            'id': 0, 
            'name': 'status.py', 
            'interperter': '/usr/bin/python3', 
            'content': script || fs.readFileSync('scripts/status.py', 'utf-8'),
            'args': [],
            'stdin_type': 'none',
            'stdout_type': 'blocked_json'
        };
        client.sendMessage(msg);
        this.running = true;
    }

    error: string = "";

    handleMessage(obj: message.Incomming) {
        const client = nullCheck(this.client);
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') {
                if (!obj.data) return;
                const type = obj.data.type;
                if (type === undefined || type === "status")
                    client.updateStatus(obj.data as IStatusUpdate).catch( (err) => {
                        console.log("Error updating stats", err);
                    });
                else if (type == 'docker_containers')
                    docker.handleHostDockerContainers(client, obj.data);
                else if (type == 'docker_container_state')
                    docker.handleHostDockerContainerState(client, obj.data);
                else if (type == 'docker_images')
                    docker.handleHostDockerImages(client, obj.data);
            }
            if (obj.source == 'stderr') {
                //console.log(obj.data);
                this.error += obj.data;
            }
            break;
        default:
            super.handleMessage(obj);
        }
    }
};
