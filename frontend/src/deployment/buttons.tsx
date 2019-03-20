import * as React from "react";
import * as State from '../../../shared/state'
import { observer } from "mobx-react";
import state from "../state";
import Button from '@material-ui/core/Button';

export default observer(()=>{
    const p = state.deployment;
    let hasDisabled = false;
    let hasEnabled = false;
    for (const o of p.objects) {
        if (o.enabled) hasEnabled = true;
        else hasDisabled = true;
    }

    let cancel = false;
    let start = false;
    let stop = false;
    let deployAll = false;
    let canSelect = false;
    switch (p.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
        cancel = true;
        break;
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        cancel = true;
        break;
    case State.DEPLOYMENT_STATUS.Deploying:
        stop = true;
        break;
    case State.DEPLOYMENT_STATUS.Done:
        deployAll = true;
        break;
    case State.DEPLOYMENT_STATUS.InvilidTree:
        deployAll = true;
        break;
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        start = true;
        cancel = true;
        canSelect = true;
        break;
    }

    return (
        <div className="deployment_buttons">
            <Button variant="contained" disabled={!start} onClick={(e)=>p.start()}>Start</Button>
            <Button variant="contained" disabled={!stop} onClick={(e)=>p.stop()}>Stop</Button>
            <Button variant="contained" disabled={!cancel} onClick={(e)=>p.cancel()}>Cancel</Button>
            <Button variant="contained" disabled={!deployAll} onClick={(e)=>p.deployAll(false)}>Deploy All</Button>
            <Button variant="contained" disabled={!deployAll} onClick={(e)=>p.deployAll(true)}>Redeploy All</Button>
            <Button variant="contained" disabled={!canSelect || !hasDisabled} onClick={(e)=>p.toggle(null, true)}>Enable all</Button>
            <Button variant="contained" disabled={!canSelect || !hasEnabled} onClick={(e)=>p.toggle(null, false)}>Disable all</Button>
        </div>
        );
    });
