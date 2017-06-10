import * as React from "react";
import {IMainState, } from '../reducers';
import * as State from '../../../shared/state'
import * as Actions from '../../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import RaisedButton from 'material-ui/RaisedButton';

interface StateProps {
    status: State.DEPLOYMENT_STATUS;
    hasDisabled: boolean;
    hasEnabled: boolean;
}

interface DispatchProps {
    cancel: ()=>void;
    stop: ()=>void;
    start: ()=>void;
    deployAll: (redeploy:boolean)=>void;
    toggleAll: (enabled: boolean)=>void;
}

function mapStateToProps(s:IMainState, {}): StateProps {
    let hasDisabled = false;
    let hasEnabled = false;
    for (const o of s.deployment.objects) {
        if (o.enabled) hasEnabled = true;
        else hasDisabled = true;
    }
    return {status: s.deployment.status, hasDisabled, hasEnabled};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, {}): DispatchProps {
    return {
        cancel: () => {
            const a: Actions.ICancelDeployment = {
                type: Actions.ACTION.CancelDeployment,
            };
            dispatch(a);
        },
       stop: () => {
            const a: Actions.IStopDeployment = {
                type: Actions.ACTION.StopDeployment,
            };
            dispatch(a);
        },
        start: () => {
            const a: Actions.IStartDeployment = {
                type: Actions.ACTION.StartDeployment,
            };
            dispatch(a);
        },
        deployAll: (redeploy:boolean) => {
            const a: Actions.IDeployObject = {
                type: Actions.ACTION.DeployObject,
                id: null,
                redeploy
            };
            dispatch(a);
        },
        toggleAll: (enabled:boolean) => {
            const a: Actions.IToggleDeploymentObject = {
                type: Actions.ACTION.ToggleDeploymentObject,
                index: null,
                enabled,
                source: "webclient"
            };
            dispatch(a);
        },
    }
};

function ButtonsImpl(props:StateProps & DispatchProps) {
    let cancel = false;
    let start = false;
    let stop = false;
    let deployAll = false;
    let canSelect = false;
    switch (props.status) {
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
            <RaisedButton label="Start" disabled={!start} onClick={(e)=>props.start()} />
            <RaisedButton label="Stop" disabled={!stop} onClick={(e)=>props.stop()} />
            <RaisedButton label="Cancel" disabled={!cancel} onClick={(e)=>props.cancel()} />
            <RaisedButton label="Deploy all" disabled={!deployAll} onClick={(e)=>props.deployAll(false)} />
            <RaisedButton label="Redeploy all" disabled={!deployAll} onClick={(e)=>props.deployAll(true)} />
            <RaisedButton label="Enable all" disabled={!canSelect || !props.hasDisabled} onClick={(e)=>props.toggleAll(true)} />
            <RaisedButton label="Disable all" disabled={!canSelect || !props.hasEnabled} onClick={(e)=>props.toggleAll(false)} />
        </div>
        );
}

export const Buttons = connect(mapStateToProps, mapDispatchToProps)(ButtonsImpl);
export default Buttons;