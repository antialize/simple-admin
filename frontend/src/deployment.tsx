import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState, IDeploymentState} from './reducers';
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import Checkbox from 'material-ui/Checkbox';

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
    deployAll: (redeploy:boolean)=>void;
    toggle: (id:number, enabled: boolean) => void;
    setPage(e: React.MouseEvent<{}>, p: State.IPage):void;
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
        deployAll: (redeploy:boolean) => {
            const a: Actions.IDeployObject = {
                type: Actions.ACTION.DeployObject,
                id: null,
                redeploy
            };
            dispatch(a);
        },
        toggle: (index:number, enabled:boolean) => {
            const a: Actions.IToggleDeploymentObject = {
                type: Actions.ACTION.ToggleDeploymentObject,
                index,
                enabled,
                source: "webclient"
            };
            dispatch(a);
        },
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }
};

let theTerm = new Terminal({cursorBlink: false, scrollback: 10000});
let oldCount: number = 0;
let clearCount: number = 0;

export class DeployLog extends React.Component<{}, {}> {
    div: HTMLDivElement = null;
    interval: number;

    constructor(props: any) {
        super(props);
    }
    //this.termDiv = document.createElement('div');
    //this.termDiv.style.height = "100%";
    //this.term.open(this.termDiv);
    componentDidMount() {
        theTerm.open(this.div);
        theTerm.fit();

        //$(window).resize(() => {
        //    theTerm.fit();      
        //});
        //this.interval = setInterval(()=>theTerm.term.fit(), 2000);
    }

    render() {
        return <div className="deployment_log" ref={(div)=>this.div=div}/>
    }
}

function DeploymentImpl(props:StateProps & DispatchProps) {
    let spin = false;
    let cancel = false;
    let status = "";
    let items = false;

    if (props.d.logClearCount != clearCount) {
        theTerm.clear();
        clearCount = props.d.logClearCount;
        oldCount = 0;
    }
    
    for (;oldCount < props.d.log.length; ++oldCount)
        theTerm.write(props.d.log[oldCount])

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
        status = " - Done"
        spin = false;
        items = true;
        break;
    case State.DEPLOYMENT_STATUS.InvilidTree:
        status = " - Invalid tree"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        status = " - Review changes";
        spin = false;
        cancel = true;
        items = true;
    }

    let content = null;

    let cannotSelect=(props.d.status != State.DEPLOYMENT_STATUS.ReviewChanges);
    let hasDisabled = false;
    let hasEnabled = false;
    if (items && props.d.objects.length > 0) {
        let rows = props.d.objects.map((o) => {
            let cn:string;
            switch(o.status) {
            case State.DEPLOYMENT_OBJECT_STATUS.Deplying: cn = "deployment_active"; break;
            case State.DEPLOYMENT_OBJECT_STATUS.Failure: cn = "deployment_failure"; break;
            case State.DEPLOYMENT_OBJECT_STATUS.Success: cn = "deployment_success"; break;
            case State.DEPLOYMENT_OBJECT_STATUS.Normal: cn = o.enabled?"deployment_normal":"deployment_disabled"; break;
            }
            let act:string;
            switch(o.action) {
            case State.DEPLOYMENT_OBJECT_ACTION.Add: act="Add"; break;
            case State.DEPLOYMENT_OBJECT_ACTION.Modify: act="Modify"; break;
            case State.DEPLOYMENT_OBJECT_ACTION.Remove: act="Remove"; break;
            case State.DEPLOYMENT_OBJECT_ACTION.Trigger: act="Trigger"; break;
            }

            if (o.enabled) hasEnabled = true;
            else hasDisabled = true;

            return <tr key={o.index} className={cn} alt={o.script}>
                <td>{o.hostName}</td>
                <td>{o.title}</td>
                <td>{o.typeName}</td>
                <td>{act}</td>
                <td><Checkbox checked={o.enabled} disabled={cannotSelect} onCheck={(e, checked)=>props.toggle(o.index, checked)}/></td>
                <td><RaisedButton label="Details" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.DeploymentDetails, index: o.index})} href={page.link({type:State.PAGE_TYPE.DeploymentDetails, index: o.index})} /></td>
                </tr>;
        });

        content = (
            <div className="deployment_items">
                <table className="deployment">
                    <thead>
                        <tr>
                            <th>Host</th><th>Object</th><th>Type</th><th>Action</th><th>Enable</th><th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>);
    }

    let selectAll = function() {
        for (let o of props.d.objects) {
            if (o.enabled) continue;
            props.toggle(o.index, true);
        }
    }

    let deselectAll = function() {
        for (let o of props.d.objects) {
            if (!o.enabled) continue;
            props.toggle(o.index, false);
        }
    }
    return (
        <div className="deployment_container">
            <h1 className="deployment_header">
                {spin?<CircularProgress />:null} Deployment{status}
            </h1>
	        <div className="deployment_message">{props.d.message?<ul>{props.d.message.split("\n").map(v=><li>{v}</li>)}</ul>:null}</div>
            {content}
            <DeployLog />
            <div className="deployment_buttons">
                <RaisedButton label="Start" disabled={props.d.status != State.DEPLOYMENT_STATUS.ReviewChanges} onClick={(e)=>props.start()} />
                <RaisedButton label="Stop" disabled={props.d.status != State.DEPLOYMENT_STATUS.Deploying} onClick={(e)=>props.stop()} />
                <RaisedButton label="Cancel" disabled={!cancel} onClick={(e)=>props.cancel()} />
                <RaisedButton label="Deploy all" disabled={props.d.status != State.DEPLOYMENT_STATUS.Done && props.d.status != State.DEPLOYMENT_STATUS.InvilidTree} onClick={(e)=>props.deployAll(false)} />
                <RaisedButton label="Redeploy all" disabled={props.d.status != State.DEPLOYMENT_STATUS.Done && props.d.status != State.DEPLOYMENT_STATUS.InvilidTree} onClick={(e)=>props.deployAll(true)} />
                <RaisedButton label="Enable all" disabled={cannotSelect || !hasDisabled} onClick={(e)=>selectAll()} />
                <RaisedButton label="Disable all" disabled={cannotSelect || !hasEnabled} onClick={(e)=>deselectAll()} />
            </div>
        </div>
        );
}

export const Deployment = connect(mapStateToProps, mapDispatchToProps)(DeploymentImpl);
