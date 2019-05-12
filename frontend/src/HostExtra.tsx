import * as React from "react";
import Box from './Box';
import HostTerminals from './Terminal';
import Log from './Log';
import Messages from './Messages';
import Services from './Services';
import Setup from './Setup';
import Smart from './Smart';
import Status from "./Status";
import state from "./state";
import { observer } from "mobx-react";
import { HostDockerContainers, DockerContainers } from "./DockerContainers";

const HostExtra = observer(function HostExtra({id}:{id:number}) {
    const status = state.status.get(id);
    const up = status && status.up;
    let c: JSX.Element | null = null;
    if (up) {
        c = (<div>
                <Box title="Smart" collapsable={true}>
                    <Smart host={id}/>
                </Box>
                <Box title="Services" collapsable={true}>
                    <Services id={id}/>
                </Box>
                <Box title="Terminal" collapsable={true}>
                    <HostTerminals id={id} />
                </Box>
                <Box title="Journal" collapsable={true}>
                    <Log type="journal" host={id} />
                </Box>
                <Box title="Dmesg" collapsable={true}>
                    <Log type="dmesg" host={id} />
                </Box>
            </div>
        )
    } else if (id > 0) {
        c = (
            <Box title="Setup" collapsable={false} expanded={true}>
               <Setup hostid={id} />
            </Box>);
    }

    return (
        <div>
            {id > 0 ? 
                <div>
                    <Messages host={id} />
                    <Box title="Status" collapsable={true} expanded={true}>
                        <Status id={id} />
                    </Box>
                    <HostDockerContainers host={id} title="DockerContainers" standalone={true} />
                </div>: null}
            {c}
        </div>)
});

export default HostExtra;


