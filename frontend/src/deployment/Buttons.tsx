import { Button } from "@mui/material";
import { observer } from "mobx-react";
import DisplayError from "../Error";
import { DEPLOYMENT_STATUS } from "../shared_types";
import state from "../state";

const Buttons = observer(function Buttons() {
    const p = state.deployment;
    if (p === null) return <DisplayError>Missing state.deployment</DisplayError>;
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
        case DEPLOYMENT_STATUS.BuildingTree:
            cancel = true;
            break;
        case DEPLOYMENT_STATUS.ComputingChanges:
            cancel = true;
            break;
        case DEPLOYMENT_STATUS.Deploying:
            stop = true;
            break;
        case DEPLOYMENT_STATUS.Done:
            deployAll = true;
            break;
        case DEPLOYMENT_STATUS.InvilidTree:
            deployAll = true;
            break;
        case DEPLOYMENT_STATUS.ReviewChanges:
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
                onClick={(_) => {
                    p.start();
                }}
            >
                Start
            </Button>
            <Button
                variant="contained"
                disabled={!stop}
                onClick={(_) => {
                    p.stop();
                }}
            >
                Stop
            </Button>
            <Button
                variant="contained"
                disabled={!cancel}
                onClick={(_) => {
                    p.cancel();
                }}
            >
                Cancel
            </Button>
            <Button
                variant="contained"
                disabled={!deployAll}
                onClick={(_) => {
                    p.deployAll(false);
                }}
            >
                Deploy All
            </Button>
            <Button
                variant="contained"
                disabled={!deployAll}
                onClick={(_) => {
                    p.deployAll(true);
                }}
            >
                Redeploy All
            </Button>
            <Button
                variant="contained"
                disabled={!canSelect || !hasDisabled}
                onClick={(_) => {
                    p.toggle(null, true);
                }}
            >
                Enable all
            </Button>
            <Button
                variant="contained"
                disabled={!canSelect || !hasEnabled}
                onClick={(_) => {
                    p.toggle(null, false);
                }}
            >
                Disable all
            </Button>
        </div>
    );
});

export default Buttons;
