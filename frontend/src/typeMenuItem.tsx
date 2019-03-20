import * as React from "react";
import * as State from '../../shared/state'
import {rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import state from "./state";
import { observer } from "mobx-react";
import ListItem from '@material-ui/core/ListItem';

export default observer(({id}:{id:number})=>{
    const name = state.types.get(id).name;
    if (id == rootId) {
        return <ListItem 
           button
           style={debugStyle()} 
           key={rootInstanceId}
           onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
           href={state.page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}>{name}</ListItem>;
   }

   return <ListItem 
    button
    style={debugStyle()}
    key={id}
    onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:id})}
    href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType:id})}>{name}</ListItem>;
});

