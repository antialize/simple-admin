import { makeObservable, observable } from "mobx";
import { DEPLOYMENT_STATUS, type IClientAction, type IDeploymentObject } from "../shared_types";
import state from "../state";

class DeploymentState {
    constructor() {
        makeObservable(this);
    }

    @observable
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;

    @observable
    message = "";

    @observable
    objects: IDeploymentObject[] = [];

    toggle(index: number | null, enabled: boolean) {
        const a: IClientAction = {
            type: "ToggleDeploymentObject",
            index,
            enabled,
            source: "webclient",
        };
        state.sendMessage(a);
    }

    cancel() {
        const a: IClientAction = {
            type: "CancelDeployment",
        };
        state.sendMessage(a);
    }

    stop() {
        state.sendMessage({
            type: "StopDeployment",
        });
    }

    start() {
        state.sendMessage({
            type: "StartDeployment",
        });
    }

    deployAll(redeploy: boolean) {
        const a: IClientAction = {
            type: "DeployObject",
            id: null,
            redeploy,
        };
        state.sendMessage(a);
    }
}

export default DeploymentState;
