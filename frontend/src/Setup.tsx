import { Typography } from "@mui/material";
import { observer } from "mobx-react";
import state from "./state";

const Setup = observer(function Setup({ hostid }: { hostid: number }) {
    const h = state.objects.get(hostid);
    const c = h?.current;
    if (!c?.content) return <div>No content</div>;
    if (typeof c.content.password !== "string") return <div>No password</div>;
    const host = window.location.hostname;
    const name = encodeURIComponent(c.name);
    const pwd = c.content.password;
    return (
        <Typography>
            <pre>
                curl -fsSL -H 'Authorization: Bearer {pwd}' 'https://{host}
                /setup.sh?host={name}' | sudo bash
            </pre>
        </Typography>
    );
});

export default Setup;
