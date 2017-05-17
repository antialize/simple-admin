import * as fs from 'fs';

import { Job } from '../job'
import * as message from '../messages'
import { SERVICE_POKE } from '../../../shared/actions'

// Type only imports
import { HostClient } from '../hostclient'

export class PokeServiceJob extends Job {
    part: string = "";

    constructor(hostClient: HostClient, public poke: SERVICE_POKE, service: string) {
        super(hostClient, null, hostClient);
        let act: string = "start";

        switch (poke) {
        case SERVICE_POKE.Start: act = "start"; break;
        case SERVICE_POKE.Stop: act = "stop"; break;
        case SERVICE_POKE.Restart: act = "restart"; break;
        case SERVICE_POKE.Reload: act = "reload"; break;
        case SERVICE_POKE.Kill: act = "kill"; break;
        }
	
        let msg: message.RunInstant = {
            'type': 'run_instant',
            'id': this.id,
            'name': 'pokeService.py',
            'interperter': '/usr/bin/python3',
            'content': fs.readFileSync('scripts/pokeService.py', 'utf-8'),
            'args': [act, service],
        };
        this.client.sendMessage(msg);
        this.running = true;
    }
}

