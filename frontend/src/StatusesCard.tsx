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
import Error from "./Error";
const StatusesCard = observer(function StatusesCard({id}: {id:number}) {
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;

    let hosts = state.objectDigests.get(hostId);
    const host = hosts && hosts.get(id);
    let name = host && host.name;
    const status = state.status.get(id);
    let up = status && status.up;

    let a: State.IPage = { type: State.PAGE_TYPE.Object, objectType: hostId, id:id};
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
                <Button onClick={(e) => page.onClick(e, a)} href={page.link(a)}>Details</Button>
            </CardActions>
        </Card>);
});

export default StatusesCard;
