import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {connect} from 'react-redux'
import * as page from './page'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect'
import state from "./state";

interface Props {
    id: number;
    name: string;
}

const makeMapStatToProps = () => {
    const getTypes = (state:IMainState) => state.types;
    const getId = (_:IMainState, props: {id:number}) => props.id;
    const getType = createSelector([getTypes, getId], (types, id)=>types[id]);
    const getHosts = (state:IMainState) => state.objectDigests[hostId] || {};
    return createSelector([getType], (type)=> {return {id: type.id, name: type.content.plural}} );
}


function TypeMenuItemImpl(props:Props) {
    if (props.id == rootId) {
         return <ListItem 
            style={debugStyle()} 
            primaryText={props.name}
            key={rootInstanceId}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}/>;
    }

    return <ListItem 
        style={debugStyle()} 
        key={props.id} 
        primaryText={props.name} 
        onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:props.id})}
        href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType:props.id})} />;
}

export let TypeMenuItem = connect(makeMapStatToProps)(TypeMenuItemImpl);
