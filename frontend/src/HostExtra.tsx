import * as React from "react";
import Box from './Box';
import HostTerminals from './Terminal';
import Log from './Log';
import Messages from './Messages';
import Setup from './Setup';
import { observer } from "mobx-react";
import { HostDockerContainers, DockerContainers } from "./DockerContainers";
import { state } from "./state";

const HostExtra = observer(function HostExtra({id}:{id:number}) {
    const up = state.hostsUp.has(id);
    let c: JSX.Element | null = null;
    if (up) {
        c = (<div>
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
                    <HostDockerContainers host={id} title="DockerContainers" standalone={true} />
                </div>: null}
            {c}
        </div>)
});

export default HostExtra;


