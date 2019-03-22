import * as React from "react";
import { observer } from "mobx-react";
import state from "./state";
import { Typography } from "@material-ui/core";

export default observer(({hostid}:{hostid:number}) => {
    let c = state.objects.get(hostid).current;
    if (!c || !c.content) return <div>No content</div>;
    let host = window.location.hostname;
    let name = encodeURIComponent(c.name);
    let pwd = encodeURIComponent(c.content.password);
    return <Typography><pre>wget -q "https://{host}/setup.sh?host={name}&token={pwd}"  -O - | sudo bash</pre></Typography>;
});
