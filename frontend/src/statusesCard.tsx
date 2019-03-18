import * as React from "react";
import { connect, Dispatch } from 'react-redux';
import { IMainState } from './reducers';
import { IStatus, IStatuses } from '../../shared/status';
import { hostId } from '../../shared/type';
import * as State from '../../shared/state';
import { InformationList, InformationListRow } from './information_list';
import * as page from './page'
import RaisedButton from 'material-ui/RaisedButton';
import { Card, CardActions, CardHeader, CardTitle, CardText } from 'material-ui/Card';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {Status} from './status';
import state from "./state";
import { observer } from "mobx-react";

interface ExternProps {
    id: number;
}

interface StateProps {
    id: number;
    up: boolean;
}

const getStatuses = (state:IMainState) => state.status;

const makeMapStatToProps = () => {
    const getId = (_:IMainState, props: ExternProps) => props.id;
    const getUp = createSelector([getId, getStatuses], (id, status) => {
        return status[id] && status[id].up;
    });
    return createSelector([getId, getUp], (id, up)=> {return {id, up}} );
}

const StatusesCardImpl = observer((p: StateProps) => {
    let hosts = state.objectDigests.get(hostId);
    let name = hosts && hosts.has(p.id) && hosts.get(p.id).name;

    let a: State.IPage = { type: State.PAGE_TYPE.Object, objectType: hostId, id:p.id, version: null };
    let elm;
    if (p.up)
        elm = <Status id={p.id} />;
    else
        elm = <div>Down</div>;

    return (
        <Card key={p.id} style={{ margin: '5px' }}>
            <CardTitle title={name} />
            <CardText>{elm}</CardText>
            <CardActions>
                <RaisedButton onClick={(e) => state.page.onClick(e, a)} label="Details" href={state.page.link(a)} />
            </CardActions>
        </Card>);
});

export let StatusesCard = connect<StateProps, {}, ExternProps>(makeMapStatToProps)(StatusesCardImpl);
