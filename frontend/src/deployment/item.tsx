import * as React from "react";
import {IMainState, IDeploymentState} from '../reducers';
import * as State from '../../../shared/state'
import * as Actions from '../../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import RaisedButton from 'material-ui/RaisedButton';
import Checkbox from 'material-ui/Checkbox';
import * as page from '../page'

interface IProps {
    index: number;
}

interface StateProps {
    canSelect: boolean;
    index: number;
    enabled: boolean;
    hostName: string;
    status: State.DEPLOYMENT_OBJECT_STATUS;
    action: State.DEPLOYMENT_OBJECT_ACTION;
    title: string;
    typeName: string;
}

interface DispatchProps {
    toggle: (id:number, enabled: boolean) => void;
    setPage(e: React.MouseEvent<{}>, p: State.IPage):void;
}

function mapStateToProps(s:IMainState, p:IProps): StateProps {
    const o = s.deployment.objects[p.index];
    return {
        canSelect: s.deployment.status == State.DEPLOYMENT_STATUS.ReviewChanges,
        index: o.index,
        hostName: o.hostName,
        status: o.status,
        action: o.action,
        title: o.title,
        typeName: o.typeName,
        enabled: o.enabled
    }

}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:IProps): DispatchProps {
    return {
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
}

function ItemImpl(props:StateProps & DispatchProps) {
    let items = false;

    let cn:string;
    switch(props.status) {
    case State.DEPLOYMENT_OBJECT_STATUS.Deplying: cn = "deployment_active"; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Failure: cn = "deployment_failure"; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Success: cn = "deployment_success"; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Normal: cn = props.enabled?"deployment_normal":"deployment_disabled"; break;
    }
    let act:string;
    switch(props.action) {
    case State.DEPLOYMENT_OBJECT_ACTION.Add: act="Add"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Modify: act="Modify"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Remove: act="Remove"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Trigger: act="Trigger"; break;
    }

    return (<tr key={props.index} className={cn}>
        <td>{props.hostName}</td>
        <td>{props.title}</td>
        <td>{props.typeName}</td>
        <td>{act}</td>
        <td><Checkbox checked={props.enabled} disabled={!props.canSelect} onCheck={(e, checked)=>props.toggle(props.index, checked)}/></td>
        <td><RaisedButton label="Details" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.DeploymentDetails, index: props.index})} href={page.link({type:State.PAGE_TYPE.DeploymentDetails, index: props.index})} /></td>
        </tr>
    );
}

export const Item = connect(mapStateToProps, mapDispatchToProps)(ItemImpl);
export default Item;