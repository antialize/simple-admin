import * as React from "react";
import * as State from '../../shared/state'
import { hostId} from '../../shared/type'
import state from "./state";
import { observer } from "mobx-react";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import Avatar from "@material-ui/core/Avatar";

export default observer(({id}: {id:number}) => {
    const name = state.objectDigests.get(hostId).get(id).name;
    const up = state.status.has(id) && state.status.get(id).up;
    let messages = 0;
    for (let [id, msg] of state.messages)
        if (!msg.dismissed && msg.host == id)
            ++messages;
    return <ListItem 
            button
            style={{paddingLeft: 40}}
            key={id}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: id, version:null})}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: id, version:null})}>
                <ListItemText>{name}</ListItemText>
                {messages?<Avatar style={{color:"black", backgroundColor:"red"}}>{messages}</Avatar>:null}
            </ListItem>;
});

