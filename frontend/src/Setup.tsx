import { Typography } from "@mui/material";
import state from "./state";
import { observer } from "mobx-react";

const Setup = observer(function Setup({ hostid }: { hostid: number }) {
    const h = state.objects.get(hostid);
    const c = h?.current;
    if (!c?.content) return <div>No content</div>;
    const host = window.location.hostname;
    const name = encodeURIComponent(c.name);
    const pwd = encodeURIComponent(c.content.password);
    return (
        <Typography>
            <pre>
                wget -q &quot;https://{host}/setup.sh?host={name}&token={pwd}&quot; -O - | sudo bash
            </pre>
        </Typography>
    );
});

export default Setup;
