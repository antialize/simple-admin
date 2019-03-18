import * as React from "react";
import {ListItem} from 'material-ui/List';
import * as State from '../../shared/state'
import {hostId} from '../../shared/type'
import {debugStyle} from './debug';
import {HostMenuItem} from './hostMenuItem';
import state from "./state";
import { observer } from "mobx-react";

export default observer(() => {
    let type = state.types.get(hostId);
    let hosts = [];
    if (state.objectDigests.has(hostId)) {
        for (let [id, o] of state.objectDigests.get(hostId)) {
            hosts.push({name: o.name, id});
        }
        hosts.sort((l, r)=>{return l.name < r.name?-1:1});
    }

    let nestedItems=[];
    for (const host of hosts) 
        nestedItems.push(<HostMenuItem id={host.id} key={host.id} />);
    
    return <ListItem 
        style={debugStyle()} 
        key={hostId} 
        primaryText={type.content.plural} 
        onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:hostId})}
        href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType:hostId})}
        initiallyOpen={true}
        nestedItems={nestedItems}/>;
});

