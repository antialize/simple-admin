import * as React from "react";
import * as State from '../../shared/state';
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import Status from './Status';
import Typography from "@material-ui/core/Typography";
import state from "./state";
import { hostId } from '../../shared/type';
import { observer } from "mobx-react";

const StatusesCard = observer(function StatusesCard({id}: {id:number}) {
    let hosts = state.objectDigests.get(hostId);
    let name = hosts && hosts.has(id) && hosts.get(id).name;
    let up = state.status.has(id) && state.status.get(id).up;

    let a: State.IPage = { type: State.PAGE_TYPE.Object, objectType: hostId, id:id, version: null };
    let elm;
    if (up)
        elm = <Status id={id} />;
    else
        elm = <Typography color="error" variant="body1">Down</Typography>;

    return (
        <Card key={id} style={{ margin: '5px' }}>
            <CardHeader title={name} />
            <CardContent>{elm}</CardContent>
            <CardActions>
                <Button onClick={(e) => state.page.onClick(e, a)} href={state.page.link(a)}>Details</Button>
            </CardActions>
        </Card>);
});

export default StatusesCard;
