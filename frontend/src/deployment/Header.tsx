import { CircularProgress, Typography } from "@mui/material";
import { observer } from "mobx-react";
import DisplayError from "../Error";
import { DEPLOYMENT_STATUS } from "../shared_types";
import state from "../state";

const Header = observer(function Header() {
    const deployment = state.deployment;
    if (deployment === null) return <DisplayError>Missing state.deployment</DisplayError>;
    let spin = false;
    let status = "";

    switch (deployment.status) {
        case DEPLOYMENT_STATUS.BuildingTree:
            status = " - Building tree";
            spin = true;
            break;
        case DEPLOYMENT_STATUS.ComputingChanges:
            status = " - Computing changes";
            spin = true;
            break;
        case DEPLOYMENT_STATUS.Deploying:
            status = " - Deploying";
            spin = true;
            break;
        case DEPLOYMENT_STATUS.Done:
            status = " - Done";
            spin = false;
            break;
        case DEPLOYMENT_STATUS.InvilidTree:
            status = " - Invalid tree";
            spin = false;
            break;
        case DEPLOYMENT_STATUS.ReviewChanges:
            status = " - Review changes";
            spin = false;
    }
    return (
        <Typography variant="h5" component="h4" color="textPrimary">
            {spin ? <CircularProgress /> : null} Deployment{status}
        </Typography>
    );
});

export default Header;
