import * as React from "react";
import Buttons from './deployment/buttons';
import Header from './deployment/header';
import Message from './deployment/message'
import Items from './deployment/items'
import Log from './deployment/log';
import { observable, computed } from "mobx";
import { DEPLOYMENT_STATUS, IDeploymentObject } from "../../shared/state";
import state from "./state";
import * as Actions from '../../shared/actions'

export class DeploymentState {
    @observable
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;

    @observable
    message: string = "";

    @observable
    objects: IDeploymentObject[] = [];

    toggle(index:number|null, enabled:boolean) {
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

    deployAll(redeploy:boolean)  {
        const a: Actions.IDeployObject = {
            type: Actions.ACTION.DeployObject,
            id: null,
            redeploy
        };
        state.sendMessage(a);
    }
};


export function Deployment(props:{}) {
    return (
        <div className="deployment_container">
            <Header />
            <Message />
            <Items />
            <Log />
            <Buttons />
        </div>
        );
}

export default Deployment;

