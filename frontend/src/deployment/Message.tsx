import { Typography } from "@mui/material";
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
                        <Typography key={v} component="li" color="textPrimary">
                            {v}
                        </Typography>
                    ))}
                </ul>
            ) : null}
        </div>
    );
});

export default Messages;
