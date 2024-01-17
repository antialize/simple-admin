import * as State from ".././shared/state";
import state from "../state";
import {observer} from "mobx-react";
import Error from "../Error";
import {Button} from "@mui/material";

const Buttons = observer(function Buttons() {
    const p = state.deployment;
    if (p === null) return <Error>Missing state.deployment</Error>;
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
            <Button
                variant="contained"
                disabled={!start}
                onClick={_ => {
                    p.start();
                }}>
                Start
            </Button>
            <Button
                variant="contained"
                disabled={!stop}
                onClick={_ => {
                    p.stop();
                }}>
                Stop
            </Button>
            <Button
                variant="contained"
                disabled={!cancel}
                onClick={_ => {
                    p.cancel();
                }}>
                Cancel
            </Button>
            <Button
                variant="contained"
                disabled={!deployAll}
                onClick={_ => {
                    p.deployAll(false);
                }}>
                Deploy All
            </Button>
            <Button
                variant="contained"
                disabled={!deployAll}
                onClick={_ => {
                    p.deployAll(true);
                }}>
                Redeploy All
            </Button>
            <Button
                variant="contained"
                disabled={!canSelect || !hasDisabled}
                onClick={_ => {
                    p.toggle(null, true);
                }}>
                Enable all
            </Button>
            <Button
                variant="contained"
                disabled={!canSelect || !hasEnabled}
                onClick={_ => {
                    p.toggle(null, false);
                }}>
                Disable all
            </Button>
        </div>
    );
});

export default Buttons;
