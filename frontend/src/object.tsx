
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
import {IType} from '../../shared/type'


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
    type: IObject2<IType>;
    typeId: number;
}

interface DispactProps {
    discard: () => void;
    save: () => void;
    deploy: () => void;
    delete: () => void;
}

function mapStateToProps(s: IMainState, p: IProps): StateProps {
    return {
        type: s.types[p.type],
        typeId: p.type,
        id: p.id,
        hasCurrent: p.id in s.objects && s.objects[p.id].current != null,
        canDeploy: s.deployment.status == DEPLOYMENT_STATUS.Done || s.deployment.status == DEPLOYMENT_STATUS.InvilidTree,
        touched: p.id in s.objects &&  s.objects[p.id].touched
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
        deploy: () => {
            const a: IDeployObject = {
                type: ACTION.DeployObject,
                id: p.id
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

    return (
        <div>
            <Box title={p.type.name} expanded={true} collapsable={true}>
                <div><Type id={p.id} type={p.type.content} typeId={p.typeId}/></div>
                <div>
                    <RaisedButton label="Save" primary={true} style={{ margin: 10 }} onClick={p.save} disabled={!p.touched}/>
                    <RaisedButton label="Deploy" primary={true} style={{margin:10}} onClick={p.deploy} disabled={!p.canDeploy}/>
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
