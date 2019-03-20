import * as React from "react";
import { ListItem} from 'material-ui/List';
import * as State from '../../shared/state'
import { hostId} from '../../shared/type'
import {debugStyle} from './debug';
import Avatar from 'material-ui/Avatar';
import state from "./state";
import { observer } from "mobx-react";

export default observer(({id}: {id:number}) => {
    const name = state.objectDigests.get(hostId).get(id).name;
    const up = state.status.has(id) && state.status.get(id).up;
    let messages = 0;
    for (let [id, msg] of state.messages)
        if (!msg.dismissed && msg.host == id)
            ++messages;
    return <ListItem 
            nestedLevel={1}
            primaryText={name}
            style={debugStyle({color:up?"black":"red"})}
            key={id}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: id, version:null})}
            rightAvatar={messages?(<Avatar color="black" backgroundColor="red">{messages}</Avatar>):null}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: id, version:null})}/>;
});

