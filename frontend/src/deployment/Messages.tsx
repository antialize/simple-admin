import * as React from "react";
import state from "../state";
import { observer } from "mobx-react";

const Messages = observer(function Messages() {
    return <div className="deployment_message">{state.deployment.message?<ul>{state.deployment.message.split("\n").map(v=><li>{v}</li>)}</ul>:null}</div>
});

export default Messages;
