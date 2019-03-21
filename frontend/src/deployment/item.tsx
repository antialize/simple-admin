import * as React from "react";
import * as State from '../../../shared/state'
import { observer } from "mobx-react";
import state from "../state";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";

interface IProps {
    index: number;
}

export default observer((p:IProps)=>{
    let o = state.deployment.objects[p.index];
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
    const canSelect = state.deployment.status == State.DEPLOYMENT_STATUS.ReviewChanges;
    return (<tr key={o.index} className={cn}>
        <td>{o.hostName}</td>
        <td>{o.title}</td>
        <td>{o.typeName}</td>
        <td>{act}</td>
        <td><Checkbox checked={o.enabled} disabled={!canSelect} onChange={(e)=>state.deployment.toggle(o.index, e.target.checked)}/></td>
        <td><Button variant="contained" onClick={(e)=>{
            state.page.onClick(e, {type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}}
            href={state.page.link({type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}>Details</Button></td>
        </tr>
    );
});
