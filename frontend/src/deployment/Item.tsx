import * as React from "react";
import * as State from '../../../shared/state';
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import state from "../state";
import { StyledComponentProps } from "@material-ui/core/styles";
import { observer } from "mobx-react";

interface IProps {
    index: number;
}

const Item = observer((p:IProps&StyledComponentProps)=>{
    let o = state.deployment.objects[p.index];
    let cn:string;
    switch(o.status) {
    case State.DEPLOYMENT_OBJECT_STATUS.Deplying: cn = p.classes.active; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Failure: cn = p.classes.failure; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Success: cn = p.classes.success; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Normal: cn = o.enabled?p.classes.normal:p.classes.disabled; break;
    }
    let act:string;
    switch(o.action) {
    case State.DEPLOYMENT_OBJECT_ACTION.Add: act="Add"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Modify: act="Modify"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Remove: act="Remove"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Trigger: act="Trigger"; break;
    }
    const canSelect = state.deployment.status == State.DEPLOYMENT_STATUS.ReviewChanges;
    return (<tr className={cn} key={o.index}>
        <td>{o.hostName}</td>
        <td>{o.title}</td>
        <td>{o.typeName}</td>
        <td>{act}</td>
        <td><Checkbox checked={o.enabled} disabled={!canSelect} onChange={(e)=>state.deployment.toggle(o.index, e.target.checked)}/></td>
        <td><Button onClick={(e)=>{
            state.page.onClick(e, {type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}}
            href={state.page.link({type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}>Details</Button></td>
        </tr>
    );
});

export default Item;
