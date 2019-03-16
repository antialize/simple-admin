
import { IMainState } from './reducers'
import { Dispatch } from 'redux'
import { connect } from 'react-redux'
import * as React from "react"
import {  PAGE_TYPE } from '../../shared/state'
import { ACTION, IDiscardObject, ISaveObject, IDeployObject,  IDeleteObject} from '../../shared/actions'
import CircularProgress from 'material-ui/CircularProgress'
import RaisedButton from 'material-ui/RaisedButton'
import { HostExtra } from './hostextra'
import { Box } from './box'
import {Type} from './type'
import { hostId, userId} from '../../shared/type'
import { UserExtra } from './userextra';
import state from './state';

interface IProps {
    type: number;
    id: number;
    version?: number;
}

interface StateProps {
    id: number;
    hasCurrent: boolean;
    canDeploy: boolean;
    canCancel: boolean;
    touched: boolean;
    typeName: string;
    typeId: number;
    version: number;
    versions: number;
}



interface DispactProps {
    discard: () => void;
    save: () => void;
    deploy: (cancel: boolean, redeploy:boolean) => void;
    delete: () => void;
}

function mapStateToProps(s: IMainState, p: IProps): StateProps {
    let versions = 1;
    if (p.id in s.objects) {
        for (let version in s.objects[p.id].versions)
            versions = Math.max(versions, (+version)+1);
    }
   
    return {
        typeName: s.types[p.type].name,
        typeId: p.type,
        id: p.id,
        hasCurrent: p.id in s.objects && s.objects[p.id].current != null,
        canDeploy: true,  // s.deployment.status == DEPLOYMENT_STATUS.Done || s.deployment.status == DEPLOYMENT_STATUS.InvilidTree || s.deployment.status == DEPLOYMENT_STATUS.BuildingTree || s.deployment.status == DEPLOYMENT_STATUS.ComputingChanges || s.deployment.status == DEPLOYMENT_STATUS.ReviewChanges,
        canCancel: true, //s.deployment.status == DEPLOYMENT_STATUS.BuildingTree || s.deployment.status == DEPLOYMENT_STATUS.ComputingChanges || s.deployment.status == DEPLOYMENT_STATUS.ReviewChanges,
        touched: p.id in s.objects &&  s.objects[p.id].touched,
        version: p.version,
        versions: versions
    };
}

function mapDispatchToProps(dispatch: Dispatch<IMainState>, p: IProps): DispactProps {
    return {
        discard: () => {
            const a: IDiscardObject = {
                type: ACTION.DiscardObject,
                id: p.id
            };
            dispatch(a);
        },
        save: () => {
            const a: ISaveObject = {
                type: ACTION.SaveObject,
                id: p.id
            };
            dispatch(a);
        },
        deploy: (cancle: boolean, redeploy:boolean) => {
            if (cancle) {
                state.deployment.cancel();
            }
            const a: IDeployObject = {
                type: ACTION.DeployObject,
                id: p.id,
                redeploy
            };
            dispatch(a);
            state.page.set({type: PAGE_TYPE.Deployment});
        },
        delete: () => {
            if (confirm("Are you sure you want to delete the object?")) {
                const a: IDeleteObject = {
                    type: ACTION.DeleteObject,
                    id: p.id
                };
                dispatch(a);
            }
        }
    }
}

function ObjectImpl(p: DispactProps & StateProps) {
    if (!p.hasCurrent) return <CircularProgress />;
    let isNew = p.id < 0;
    let content = null;
    let extra = null;
    if (p.typeId == hostId) {
        extra = <HostExtra id={p.id} />;
    }
    if (p.typeId == userId) {
        extra = <UserExtra id={p.id} />
    }
    return (
        <div>
            <Box title={p.typeName} expanded={true} collapsable={true}>
                <div><Type id={p.id} typeId={p.typeId}/></div>
                <div>{p.versions}</div>
                <div>
                    <RaisedButton label="Save" primary={true} style={{ margin: 10 }} onClick={p.save} disabled={!p.touched}/>
                    <RaisedButton label={p.canCancel?"Deploy (cancel current)":"Deploy"} primary={true} style={{margin:10}} onClick={()=>p.deploy(p.canCancel, false)} disabled={!p.canDeploy}/>
                    <RaisedButton label={p.canCancel?"Redeploy (cancel current)":"Redeploy"} primary={true} style={{margin:10}} onClick={()=>p.deploy(p.canCancel, true)} disabled={!p.canDeploy}/>
                    <RaisedButton label="Discard" secondary={true} style={{ margin: 10 }} onClick={p.discard} disabled={!p.touched} />
                    <RaisedButton label="Delete" secondary={true} style={{ margin: 10 }} onClick={p.delete} disabled={!p.canDeploy /*|| p.class == 'root'*/}/>
                </div>
            </Box>
            <div>
                {extra}
            </div>
        </div>);
}

export const Object = connect(mapStateToProps, mapDispatchToProps)(ObjectImpl);
