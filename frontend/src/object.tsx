
import * as React from "react"
import {  DEPLOYMENT_STATUS } from '../../shared/state'
import HostExtra from './hostextra'
import { Box } from './box'
import Type from './type'
import { hostId, userId} from '../../shared/type'
import UserExtra from './userextra';
import state from './state';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Button from "@material-ui/core/Button";

export default observer(({type, id, version}:{type:number, id:number, version?:number})=>{
    if (!state.objects.has(id) || !state.objects.get(id).current)
        return <CircularProgress />;
    let o = state.objects.get(id);
    let typeName = state.types.get(type).name;
    let extra = null;
    let versions = 1;
    for (let [k,v] of o.versions)
        versions = Math.max(versions, v.version+1);

    const canDeploy = state.deployment.status == DEPLOYMENT_STATUS.Done || state.deployment.status == DEPLOYMENT_STATUS.InvilidTree || state.deployment.status == DEPLOYMENT_STATUS.BuildingTree || state.deployment.status == DEPLOYMENT_STATUS.ComputingChanges || state.deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
    const canCancel =  state.deployment.status == DEPLOYMENT_STATUS.BuildingTree || state.deployment.status == DEPLOYMENT_STATUS.ComputingChanges || state.deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
    const touched = o.touched;


    if (type == hostId) {
        extra = <HostExtra id={id} />;
    }
    if (type == userId) {
        extra = <UserExtra id={id} />
    }
    return (
        <div>
            <Box title={typeName} expanded={true} collapsable={true}>
                <div><Type id={id} typeId={type}/></div>
                <div>{versions}</div>
                <div>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>o.save()} disabled={!touched}>Save</Button>
                    <Button variant="contained" color="primary" style={{margin:10}} onClick={()=>o.deploy(canCancel, false)} disabled={!canDeploy}>{canCancel?"Deploy (cancel current)":"Deploy"}</Button>
                    <Button variant="contained" color="primary" style={{margin:10}} onClick={()=>o.deploy(canCancel, true)} disabled={!canDeploy}>{canCancel?"Redeploy (cancel current)":"Redeploy"}</Button>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>o.discard()} disabled={!touched}>Discard</Button>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>{
                        if (confirm("Are you sure you want to delete the object?")) o.delete();}}
                        disabled={!canDeploy /*|| p.class == 'root'*/}>Delete</Button>
                </div>
            </Box>
            <div>
                {extra}
            </div>
        </div>);
})

