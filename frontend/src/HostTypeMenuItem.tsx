import * as React from "react";
import * as State from '../../shared/state';
import Collapse from "@material-ui/core/Collapse";
import HostMenuItem from './HostMenuItem';
import List from "@material-ui/core/List";
import ListItem from '@material-ui/core/ListItem';
import state from "./state";
import { hostId } from '../../shared/type';
import { observer } from "mobx-react";

const HostTypeMenuItem =  observer(function HostTypeMenuItem() {
    const page = state.page;
    if (!page) return <span>Missing state.page</span>;
    let type = state.types.get(hostId);
    if (!type) return <span>Missing host type</span>;
    let hosts = [];
    const digest = state.objectDigests.get(hostId);
    if (digest !== undefined) {
        for (let [id, o] of digest) {
            hosts.push({name: o.name, id});
        }
        hosts.sort((l, r)=>{return l.name < r.name?-1:1});
    }

    let nestedItems=[];
    for (const host of hosts) 
        nestedItems.push(<HostMenuItem id={host.id} key={host.id} />);

    return <>
        <ListItem button key={hostId}
            onClick={(e)=>page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:hostId})}
            href={page.link({type:State.PAGE_TYPE.ObjectList, objectType:hostId})}>{type.content.plural}</ListItem>
        <Collapse in={true}>
            <List disablePadding>
                {nestedItems}
            </List>
        </Collapse>
        </>;
});

export default HostTypeMenuItem;
