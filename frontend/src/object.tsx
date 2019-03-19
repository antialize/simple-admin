
import * as React from "react"
import {  DEPLOYMENT_STATUS } from '../../shared/state'
import CircularProgress from 'material-ui/CircularProgress'
import RaisedButton from 'material-ui/RaisedButton'
import { HostExtra } from './hostextra'
import { Box } from './box'
import Type from './type'
import { hostId, userId} from '../../shared/type'
import UserExtra from './userextra';
import state from './state';
import { observer } from 'mobx-react';

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
                    <RaisedButton label="Save" primary={true} style={{ margin: 10 }} onClick={()=>o.save()} disabled={!touched}/>
                    <RaisedButton label={canCancel?"Deploy (cancel current)":"Deploy"} primary={true} style={{margin:10}} onClick={()=>o.deploy(canCancel, false)} disabled={!canDeploy}/>
                    <RaisedButton label={canCancel?"Redeploy (cancel current)":"Redeploy"} primary={true} style={{margin:10}} onClick={()=>o.deploy(canCancel, true)} disabled={!canDeploy}/>
                    <RaisedButton label="Discard" secondary={true} style={{ margin: 10 }} onClick={()=>o.discard()} disabled={!touched} />
                    <RaisedButton label="Delete" secondary={true} style={{ margin: 10 }} onClick={()=>{
                        if (confirm("Are you sure you want to delete the object?")) o.delete();}}
                        disabled={!canDeploy /*|| p.class == 'root'*/}/>
                </div>
            </Box>
            <div>
                {extra}
            </div>
        </div>);
})

