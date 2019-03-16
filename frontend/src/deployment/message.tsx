import * as React from "react";
import { observer } from "mobx-react";
import state from "../state";

export default observer(()=>{
    return <div className="deployment_message">{state.deployment.message?<ul>{state.deployment.message.split("\n").map(v=><li>{v}</li>)}</ul>:null}</div>
});
