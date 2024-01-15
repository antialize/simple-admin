import { Typography } from "@mui/material";
import state from "./state";
import { observer } from "mobx-react";

const Setup = observer(function Setup({hostid}:{hostid:number}) {
    let h = state.objects.get(hostid)
    const c = h && h.current;
    if (!c || !c.content) return <div>No content</div>;
    let host = window.location.hostname;
    let name = encodeURIComponent(c.name);
    let pwd = encodeURIComponent(c.content.password);
    return <Typography><pre>wget -q "https://{host}/setup.sh?host={name}&token={pwd}"  -O - | sudo bash</pre></Typography>;
});

export default Setup;
