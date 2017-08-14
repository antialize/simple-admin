import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as page from './page'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect'

interface Props {
    setPage(e: React.MouseEvent<{}>, page:State.IPage):void;
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

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }    
}

function TypeMenuItemImpl(props:Props) {
    if (props.id == rootId) {
         return <ListItem 
            style={debugStyle()} 
            primaryText={props.name}
            key={rootInstanceId}
            onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
            href={page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}/>;
    }

    return <ListItem 
        style={debugStyle()} 
        key={props.id} 
        primaryText={props.name} 
        onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, objectType:props.id})}
        href={page.link({type:State.PAGE_TYPE.ObjectList, objectType:props.id})} />;
}

export let TypeMenuItem = connect(makeMapStatToProps, mapDispatchToProps)(TypeMenuItemImpl);
