import * as React from "react";
import * as State from '../../../shared/state'
import { observer } from "mobx-react";
import state from "../state";
import CircularProgress from "@material-ui/core/CircularProgress";

export default observer(()=>{
    let spin = false;
    let status = "";

    switch (state.deployment.status) {
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
        <h1 className="deployment_header">
            {spin?<CircularProgress />:null} Deployment{status}
        </h1>
        );
});
