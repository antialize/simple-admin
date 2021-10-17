import * as React from "react";
import * as State from '.././shared/state';
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import state from "../state";
import { StyledComponentProps } from "@material-ui/core/styles";
import { observer } from "mobx-react";
import Error from "../Error";

interface IProps {
    index: number;
}

const Item = observer(function Item(p:IProps&StyledComponentProps) {
    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployment</Error>;
    const page = state.page;
    if (page === null) return <Error>Missing state.page</Error>;
    let o = deployment.objects[p.index];
    const classes = p.classes;
    if (!classes) return <Error>Missing classes</Error>;
    let cn:string | undefined = undefined;
    switch(o.status) {
    case State.DEPLOYMENT_OBJECT_STATUS.Deplying: cn = classes.active; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Failure: cn = classes.failure; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Success: cn = classes.success; break;
    case State.DEPLOYMENT_OBJECT_STATUS.Normal: cn = o.enabled?classes.normal:classes.disabled; break;
    }
    let act:string | null = null;
    switch(o.action) {
    case State.DEPLOYMENT_OBJECT_ACTION.Add: act="Add"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Modify: act="Modify"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Remove: act="Remove"; break;
    case State.DEPLOYMENT_OBJECT_ACTION.Trigger: act="Trigger"; break;
    }
    const canSelect = deployment.status == State.DEPLOYMENT_STATUS.ReviewChanges;
    return (<tr className={cn} key={o.index}>
        <td>{o.hostName}</td>
        <td>{o.title}</td>
        <td>{o.typeName}</td>
        <td>{act}</td>
        <td><Checkbox checked={o.enabled} disabled={!canSelect} onChange={(e)=>deployment.toggle(o.index, e.target.checked)}/></td>
        <td><Button onClick={(e)=>{
            page.onClick(e, {type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}}
            href={page.link({type:State.PAGE_TYPE.DeploymentDetails, index: o.index})}>Details</Button></td>
        </tr>
    );
});

export default Item;
