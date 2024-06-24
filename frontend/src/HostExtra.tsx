import { observer } from "mobx-react";
import Box from "./Box";
import { HostDockerContainers } from "./DockerContainers";
import Messages from "./Messages";
import Setup from "./Setup";
import HostTerminals from "./Terminal";
import { state } from "./state";

const HostExtra = observer(function HostExtra({ id }: { id: number }) {
    const up = state.hostsUp.has(id);
    let c: JSX.Element | null = null;
    if (up) {
        c = (
            <Box title="Terminal" collapsable={true}>
                <HostTerminals id={id} />
            </Box>
        );
    } else if (id > 0) {
        c = (
            <Box title="Setup" collapsable={false} expanded={true}>
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
