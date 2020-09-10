import * as React from "react";
import * as State from '../../shared/state';
import Avatar from "@material-ui/core/Avatar";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import state from "./state";
import { hostId } from '../../shared/type';
import { observer } from "mobx-react";

const HostMenuItem = observer(function HostMenuItem({id}: {id:number}) {
    const page = state.page;
    if (!page) return <span>Missing state.page</span>;
    const hostDigests = state.objectDigests.get(hostId);
    if (!hostDigests) return <span>Missing host digests</span>;
    const digests = hostDigests.get(id);
    if (!digests) return <span>Missing host digest</span>;
    const name = digests.name;
    let messages = 0;
    for (let [id, msg] of state.messages)
        if (!msg.dismissed && msg.host == id)
            ++messages;
    return <ListItem
            button
            style={{paddingLeft: 40}}
            key={id}
            onClick={(e)=>page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: id})}
            href={page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: id})}>
                <ListItemText>{name}</ListItemText>
                {messages?<Avatar style={{color:"black", backgroundColor:"red"}}>{messages}</Avatar>:null}
            </ListItem>;
});

export default HostMenuItem;
