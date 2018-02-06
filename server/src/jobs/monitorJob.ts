import {Job} from '../job'
import {HostClient} from '../hostclient'
import * as message from '../messages'
import * as fs from 'fs';
import {IStatusUpdate} from '../../../shared/status'

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
        this.client.sendMessage(msg);
        this.running = true;
    }

    error: string;

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') {
                let p = this.client.updateStatus(obj.data as IStatusUpdate);
                p.catch( (err) => {
                    console.log("Error updating stats", err);
                });
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
