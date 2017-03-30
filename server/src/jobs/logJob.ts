import {Job} from '../job'
import {IHostClient, IWebClient} from '../interfaces'
import * as message from '../messages'
import * as fs from 'fs';
import {ACTION, IAddLogLines} from '../../../shared/actions'

export class LogJob extends Job {  
    part: string = "";

    constructor(hostClient: IHostClient, public webclient: IWebClient, public wcid: number, public logType: string, public unit?: string) {
        super(hostClient, null, webclient);
        this.webclient.logJobs[this.wcid] = this;
        let args = [logType];
        if (unit) args.push(unit);
        let msg: message.RunScript = {
            'type': 'run_script', 
            'id': this.id, 
            'name': 'log.py', 
            'interperter': '/usr/bin/python3', 
            'content': fs.readFileSync('log.py', 'utf-8'),
            'args': args,
            'stdin_type': 'none',
            'stdout_type': 'text'
        };
        this.client.sendMessage(msg);
        this.running = true;
    }

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') {
                const lines = (this.part + obj.data).split('\n');
                this.part = lines.pop();
                if (lines.length != 0) {
                    const msg:IAddLogLines = {
                        type: ACTION.AddLogLines,
                        id: this.wcid,
                        lines: lines
                    }
                    this.webclient.sendMessage(msg);
                }             
            }
            break;
        default:
            super.handleMessage(obj);
        }
    }

    kill() {
        if (this.wcid in this.webclient.logJobs)
            delete this.webclient.logJobs[this.wcid];
        super.kill();
    }
}

