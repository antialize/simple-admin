import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState, IDeploymentState} from './reducers';
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import * as page from './page'
import CircularProgress from 'material-ui/CircularProgress';

interface IProps {}

interface StateProps {
    d: IDeploymentState;
}

interface DispatchProps {
    cancel: ()=>void;
    stop: ()=>void;
    start: ()=>void;
    deployAll: ()=>void;
    toggle: (id:number, enabled: boolean) => void;
}

function mapStateToProps(s:IMainState, o:IProps): StateProps {
    return {d: s.deployment}
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:IProps): DispatchProps {
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
        deployAll: () => {
            const a: Actions.IDeployObject = {
                type: Actions.ACTION.DeployObject,
                id: null
            };
            dispatch(a);
        },
        toggle: (id:number, enabled:boolean) => {
            const a: Actions.IToggleDeploymentObject = {
                type: Actions.ACTION.ToggleDeploymentObject,
                id,
                enabled,
                source: "webclient"
            };
            dispatch(a);
        },
    }
}

export class DeployLog extends React.Component<{}, {}> {
    div: HTMLDivElement = null;
    term: any;
    constructor(props: any) {
        super(props);
        this.term = new Terminal({cursorBlink: false, scrollback: 10000});

    }
    //this.termDiv = document.createElement('div');
    //this.termDiv.style.height = "100%";
    //this.term.open(this.termDiv);
    componentDidMount() {
        this.term.open(this.div);
        this.term.write("Cookie");
    }

    render() {
        return <div ref={(div)=>this.div=div}/>
    }
}

function DeploymentImpl(props:StateProps & DispatchProps) {
    let spin = false;
    let cancel = false;
    let status = "";
    let items = false;

    switch (props.d.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
        status = " - Building tree";
        spin = true;
        cancel = true;
        break;
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        status = " - Computing changes";
        spin = true;
        cancel = true;
        break;
    case State.DEPLOYMENT_STATUS.Deploying:
        status = " - Deploying";
        spin = true;
        items = true;
        break;
    case State.DEPLOYMENT_STATUS.Done:
        status = ""
        spin = false;
        items = true;
        break;
    case State.DEPLOYMENT_STATUS.InvilidTree:
        status = " - Invalid tree"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        status = "";
        spin = false;
        cancel = true;
        items = true;
    }

    let content = null;
    if (props.d.status == State.DEPLOYMENT_STATUS.InvilidTree)
        content = <div>{props.d.message}</div>;
    let c2 = null;

    if (items) {
        content = (
            <div style={{display: 'flex', flexDirection: 'row', maxHeight: "calc(100vh - 170px)"}}>
                <div style={{flex: "1 1 50%", overflowY: "auto"}}>
                    KAT
                </div>
                <div style={{flex: "1 1 50%", overflowY: "auto"}}>
                    <DeployLog />
                </div>
            </div>);
    }

    return (
        <div>
            <h1>
                {spin?<CircularProgress />:null} Deployment{status}
            </h1>
            {content}
            {c2}
            <div style={{marginTop: '20px'}}>
                <RaisedButton label="Start" disabled={props.d.status != State.DEPLOYMENT_STATUS.ReviewChanges} onClick={(e)=>props.start()} />
                <RaisedButton label="Stop" disabled={props.d.status != State.DEPLOYMENT_STATUS.Deploying} onClick={(e)=>props.start()} />
                <RaisedButton label="Cancel" disabled={!cancel} onClick={(e)=>props.cancel()} />
                <RaisedButton label="Deploy all" disabled={props.d.status != State.DEPLOYMENT_STATUS.Done && props.d.status != State.DEPLOYMENT_STATUS.InvilidTree} onClick={(e)=>props.deployAll()} />
            </div>
        </div>
        );
}

export const Deployment = connect(mapStateToProps, mapDispatchToProps)(DeploymentImpl);