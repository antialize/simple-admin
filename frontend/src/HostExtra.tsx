import { observer } from "mobx-react";
import { useState } from "react";
import Box from "./Box";
import { HostDockerContainers } from "./DockerServices";
import Messages from "./Messages";
import Setup from "./Setup";
import HostTerminals from "./Terminal";
import { state } from "./state";

const HostExtra = observer(function HostExtra({ id }: { id: number }) {
    const [expanded, setExpanded] = useState(false);
    const up = state.hostsUp.has(id);
    let c: React.ReactElement | null = null;
    if (up) {
        c = (
            <Box
                key="terminal"
                title="Terminal"
                collapsable={true}
                onChange={(_, expanded) => setExpanded(expanded)}
            >
                {expanded ? <HostTerminals id={id} /> : null}
            </Box>
        );
    } else if (id > 0) {
        c = (
            <Box key="setup" title="Setup" collapsable={false} expanded={true}>
                <Setup hostid={id} />
            </Box>
        );
    }

    return (
        <div>
            {id > 0 ? (
                <div>
                    <Messages host={id} />
                    <HostDockerContainers host={id} title="DockerContainers" standalone={true} />
                </div>
            ) : null}
            {c}
        </div>
    );
});

export default HostExtra;
