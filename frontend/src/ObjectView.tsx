
import * as React from "react";
import Box from './Box';
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import HostExtra from './HostExtra';
import Type from './Type';
import Typography from "@material-ui/core/Typography";
import UserExtra from './UserExtra';
import state from './state';
import { DEPLOYMENT_STATUS } from '../../shared/state'
import { hostId, userId} from '../../shared/type'
import { observer } from 'mobx-react';
import Error from "./Error";

const ObjectView = observer(function ObjectView ({type, id, version}:{type:number, id?:number, version?:number}) {
    const deployment = state.deployment;
    if (!deployment) return <Error>Missing state.deployment</Error>;
    const o = id && state.objects.get(id);
    if (!id || !o || !o.current)
        return <CircularProgress />;
    const stype = state.types.get(type);
    if (!stype) return <Error>Missing type</Error>;
    let typeName = stype.name;
    let extra = null;
    let versions = 1;
    for (let [k,v] of o.versions)
        if (v.version)
            versions = Math.max(versions, v.version+1);

    const canDeploy = deployment.status == DEPLOYMENT_STATUS.Done || deployment.status == DEPLOYMENT_STATUS.InvilidTree || deployment.status == DEPLOYMENT_STATUS.BuildingTree || deployment.status == DEPLOYMENT_STATUS.ComputingChanges || deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
    const canCancel = deployment.status == DEPLOYMENT_STATUS.BuildingTree || deployment.status == DEPLOYMENT_STATUS.ComputingChanges || deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
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
                <div><Typography>{versions}</Typography></div>
                <div>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>o.save()} disabled={!touched}>Save</Button>
                    <Button variant="contained" color="primary" style={{margin:10}} onClick={()=>o.deploy(canCancel, false)} disabled={!canDeploy}>{canCancel?"Deploy (cancel current)":"Deploy"}</Button>
                    <Button variant="contained" color="primary" style={{margin:10}} onClick={()=>o.deploy(canCancel, true)} disabled={!canDeploy}>{canCancel?"Redeploy (cancel current)":"Redeploy"}</Button>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>o.discard()} disabled={!touched}>Discard</Button>
                    <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>{
                        if (confirm("Are you sure you want to delete the object?")) o.delete();}}
                        disabled={!canDeploy}>Delete</Button>
                    {type == hostId ? <Button variant="contained" color="primary" style={{ margin: 10 }} onClick={()=>{
                        if (confirm("Have you just reinstalled this server?")) o.resetState();}}
                        >Reset State</Button>: null}
                </div>
            </Box>
            <div>
                {extra}
            </div>
        </div>);
});

export default ObjectView;

