import {Job} from '../job'
import {HostClient} from '../hostclient'
import * as message from '../messages'
import * as fs from 'fs';
import {IStatusUpdate} from '../../../shared/status'

export class StatusJob extends Job {
    constructor(client: HostClient) {
        super(client, 0, null);
        let msg: message.RunScript = {
            'type': 'run_script', 
            'id': 0, 
            'name': 'status.py', 
            'interperter': '/usr/bin/python3', 
            'content': fs.readFileSync('scripts/status.py', 'utf-8'),
            'args': [],
            'stdin_type': 'none',
            'stdout_type': 'blocked_json'
        };
        this.client.sendMessage(msg);
        this.running = true;
    }

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') this.client.updateStatus(obj.data as IStatusUpdate);
            break;
        default:
            super.handleMessage(obj);
        }
    }
};
