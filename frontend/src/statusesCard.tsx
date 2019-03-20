import * as React from "react";
import { hostId } from '../../shared/type';
import * as State from '../../shared/state';
import * as page from './page'
import RaisedButton from 'material-ui/RaisedButton';
import { Card, CardActions, CardHeader, CardTitle, CardText } from 'material-ui/Card';
import Status from './status';
import state from "./state";
import { observer } from "mobx-react";

export default observer(({id}: {id:number}) => {
    let hosts = state.objectDigests.get(hostId);
    let name = hosts && hosts.has(id) && hosts.get(id).name;
    let up = state.status.has(id) && state.status.get(id).up;

    let a: State.IPage = { type: State.PAGE_TYPE.Object, objectType: hostId, id:id, version: null };
    let elm;
    if (up)
        elm = <Status id={id} />;
    else
        elm = <div>Down</div>;

    return (
        <Card key={id} style={{ margin: '5px' }}>
            <CardTitle title={name} />
            <CardText>{elm}</CardText>
            <CardActions>
                <RaisedButton onClick={(e) => state.page.onClick(e, a)} label="Details" href={state.page.link(a)} />
            </CardActions>
        </Card>);
});

