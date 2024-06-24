import { observer } from "mobx-react";
import DisplayError from "../Error";
import state from "../state";

const Messages = observer(function Messages() {
    const deployment = state.deployment;
    if (deployment === null) return <DisplayError>Missing state.deployments</DisplayError>;
    return (
        <div className="deployment_message">
            {deployment.message ? (
                <ul>
                    {deployment.message.split("\n").map((v) => (
                        <li key={v}>{v}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
});

export default Messages;
