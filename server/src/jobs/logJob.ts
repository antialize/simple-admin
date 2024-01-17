import * as fs from 'fs';

import { Job } from '../job';
import * as message from '../messages';
import { ACTION, IAddLogLines } from '.././shared/actions';
import nullCheck from '.././shared/nullCheck';
import type { HostClient } from '../hostclient';
import type { WebClient } from '../webclient';

export class LogJob extends Job {
    part: string = '';

    constructor(
        hostClient: HostClient,
        public webclient: WebClient,
        public wcid: number,
        public logType: string,
        public unit?: string,
    ) {
        super(hostClient, null, webclient);
        this.webclient.logJobs[this.wcid] = this;
        const args = [logType];
        if (unit) args.push(unit);
        const msg: message.RunScript = {
            type: 'run_script',
            id: this.id,
            name: 'log.py',
            interperter: '/usr/bin/python3',
            content: fs.readFileSync('scripts/log.py', 'utf-8'),
            args: args,
            stdin_type: 'none',
            stdout_type: 'text',
        };
        hostClient.sendMessage(msg);
        this.running = true;
    }

    handleMessage(obj: message.Incomming) {
        switch (obj.type) {
            case 'data':
                if (obj.source == 'stdout') {
                    const lines = (this.part + obj.data).split('\n');
                    this.part = nullCheck(lines.pop());
                    if (lines.length != 0) {
                        const msg: IAddLogLines = {
                            type: ACTION.AddLogLines,
                            id: this.wcid,
                            lines: lines,
                        };
                        if (this.webclient.auth.admin) this.webclient.sendMessage(msg);
                    }
                }
                break;
            default:
                super.handleMessage(obj);
        }
    }

    kill() {
        if (this.wcid in this.webclient.logJobs) delete this.webclient.logJobs[this.wcid];
        super.kill();
    }
}
