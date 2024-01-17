import state from "../state";
import {observer} from "mobx-react";
import Error from "../Error";

const Messages = observer(function Messages() {
    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployments</Error>;
    return (
        <div className="deployment_message">
            {deployment.message ? (
                <ul>
                    {deployment.message.split("\n").map(v => (
                        <li key={v}>{v}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
});

export default Messages;
