
import { IMainState } from './reducers'
import { Dispatch } from 'redux'
import { connect } from 'react-redux'
import * as React from "react"
import { IObject2, DEPLOYMENT_STATUS, PAGE_TYPE } from '../../shared/state'
import { ACTION, IDiscardObject, ISaveObject, IDeployObject, ISetPageAction, IDeleteObject } from '../../shared/actions'
import CircularProgress from 'material-ui/CircularProgress'
import RaisedButton from 'material-ui/RaisedButton'
import { HostExtra } from './hostextra'
import { Box } from './box'
import {setPage} from './page'
import {Type} from './type'
import {IType, hostId} from '../../shared/type'


interface IProps {
    type: number;
    id: number;
    version?: number;
}

interface StateProps {
    id: number;
    hasCurrent: boolean;
    canDeploy: boolean;
    touched: boolean;
    typeName: string;
    typeId: number;
    version: number;
    versions: number;
}

interface DispactProps {
    discard: () => void;
    save: () => void;
    deploy: (redeploy:boolean) => void;
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
        canDeploy: s.deployment.status == DEPLOYMENT_STATUS.Done || s.deployment.status == DEPLOYMENT_STATUS.InvilidTree,
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
        deploy: (redeploy:boolean) => {
            const a: IDeployObject = {
                type: ACTION.DeployObject,
                id: p.id,
                redeploy
            };
            dispatch(a);
            setPage({type: PAGE_TYPE.Deployment}, dispatch);
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
    return (
        <div>
            <Box title={p.typeName} expanded={true} collapsable={true}>
                <div><Type id={p.id} typeId={p.typeId}/></div>
                <div>{p.versions}</div>
                <div>
                    <RaisedButton label="Save" primary={true} style={{ margin: 10 }} onClick={p.save} disabled={!p.touched}/>
                    <RaisedButton label="Deploy" primary={true} style={{margin:10}} onClick={()=>p.deploy(false)} disabled={!p.canDeploy}/>
                    <RaisedButton label="Redeploy" primary={true} style={{margin:10}} onClick={()=>p.deploy(true)} disabled={!p.canDeploy}/>
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
