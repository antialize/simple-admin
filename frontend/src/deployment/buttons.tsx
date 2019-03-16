import * as React from "react";
import * as State from '../../../shared/state'
import RaisedButton from 'material-ui/RaisedButton';
import { observer } from "mobx-react";
import state from "../state";

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
            <RaisedButton label="Start" disabled={!start} onClick={(e)=>p.start()} />
            <RaisedButton label="Stop" disabled={!stop} onClick={(e)=>p.stop()} />
            <RaisedButton label="Cancel" disabled={!cancel} onClick={(e)=>p.cancel()} />
            <RaisedButton label="Deploy all" disabled={!deployAll} onClick={(e)=>p.deployAll(false)} />
            <RaisedButton label="Redeploy all" disabled={!deployAll} onClick={(e)=>p.deployAll(true)} />
            <RaisedButton label="Enable all" disabled={!canSelect || !hasDisabled} onClick={(e)=>p.toggle(null, true)} />
            <RaisedButton label="Disable all" disabled={!canSelect || !hasEnabled} onClick={(e)=>p.toggle(null, false)} />
        </div>
        );
    });
