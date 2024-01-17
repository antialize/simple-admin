import { Job } from '../job';
import type { HostClient } from '../hostclient';
import * as message from '../messages';
import * as fs from 'fs';
import * as WebSocket from 'ws';

export class ShellJob extends Job {
    public sock: WebSocket | null;
    constructor(client: HostClient, sock: WebSocket, cols: number, rows: number) {
        super(client, null, null);
        this.sock = sock;

        const msg: message.RunScript = {
            type: 'run_script',
            id: this.id,
            name: 'shell.py',
            interperter: '/usr/bin/python3',
            content: fs.readFileSync('scripts/shell.py', 'utf-8'),
            args: ['' + cols, '' + rows],
            stdin_type: 'binary',
            stdout_type: 'binary',
            stderr_type: 'binary',
        };
        client.sendMessage(msg);
        this.running = true;
        sock.on('message', (data: any) => {
            const msg: message.Data = {
                type: 'data',
                id: this.id,
                data: Buffer.from(data).toString('base64'),
            };
            client.sendMessage(msg);
        });
        sock.on('close', (_a: number, _b: string) => {
            this.sock = null;
            this.kill();
        });
    }

    kill() {
        if (this.sock !== null) {
            this.sock.close();
            this.sock = null;
        }
        super.kill();
    }

    handleMessage(obj: message.Incomming) {
        switch (obj.type) {
            case 'data':
                if (obj.source == 'stdout') {
                    if (!this.sock) throw Error('Socket is missing');
                    this.sock.send(Buffer.from(obj.data, 'base64').toString('binary'));
                }
            default:
                super.handleMessage(obj);
        }
    }
}
