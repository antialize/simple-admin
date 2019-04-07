import { observable } from "mobx";
import * as Actions from "../../../shared/actions";
import { DEPLOYMENT_STATUS, IDeploymentObject } from "../../../shared/state";
import state from "../state";

class DeploymentState {
    @observable
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;
    @observable
    message: string = "";
    @observable
    objects: IDeploymentObject[] = [];
    toggle(index: number | null, enabled: boolean) {
        const a: Actions.IToggleDeploymentObject = {
            type: Actions.ACTION.ToggleDeploymentObject,
            index,
            enabled,
            source: "webclient"
        };
        state.sendMessage(a);
    }
    cancel() {
        const a: Actions.ICancelDeployment = {
            type: Actions.ACTION.CancelDeployment,
        };
        state.sendMessage(a);
    }
    stop() {
        const a: Actions.IStopDeployment = {
            type: Actions.ACTION.StopDeployment,
        };
        state.sendMessage(a);
    }
    start() {
        const a: Actions.IStartDeployment = {
            type: Actions.ACTION.StartDeployment,
        };
        state.sendMessage(a);
    }
    deployAll(redeploy: boolean) {
        const a: Actions.IDeployObject = {
            type: Actions.ACTION.DeployObject,
            id: null,
            redeploy
        };
        state.sendMessage(a);
    }
};

export default DeploymentState;

