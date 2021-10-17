import * as React from "react";
import * as State from '.././shared/state';
import CircularProgress from "@material-ui/core/CircularProgress";
import Typography from "@material-ui/core/Typography";
import state from "../state";
import { observer } from "mobx-react";
import Error from "../Error";

const Header = observer(function Header() {
    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployment</Error>;
    let spin = false;
    let status = "";

    switch (deployment.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
        status = " - Building tree";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        status = " - Computing changes";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.Deploying:
        status = " - Deploying";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.Done:
        status = " - Done"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.InvilidTree:
        status = " - Invalid tree"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        status = " - Review changes";
        spin = false;
    }
    return (
        <Typography variant="h5" component="h4" color="textPrimary">
            {spin?<CircularProgress />:null} Deployment{status}
        </Typography>
        );
});

export default Header;
