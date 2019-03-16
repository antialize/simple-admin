import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as page from './page'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {HostMenuItem} from './hostMenuItem';
import state from "./state";

interface StateProps {
    name: string;
    hosts: {name: string, id:number}[];
}

const makeMapStatToProps = () => {
    const getTypes = (state:IMainState) => state.types;
    const getType = createSelector([getTypes], (types)=>types[hostId]);
    const getHosts = (state:IMainState) => state.objectDigests[hostId] || [];
    const getOrderedHosts = createSelector([getHosts], (hosts)=> {
        let p: {name: string, id:number}[] = [];
        for (const host of hosts) {
            p.push({name: host.name, id: host.id});
        }
        p.sort((l, r)=>{return l.name < r.name?-1:1});
        return p;
    })
    return createSelector([getType, getOrderedHosts], (type, hosts)=> {return {name: type.content.plural, hosts}} );
}

function HostTypeMenuItemImpl(props:StateProps) {
    let nestedItems=[];
    for (const host of props.hosts) {
        nestedItems.push(<HostMenuItem id={host.id} key={host.id} />);
    }
    return <ListItem 
        style={debugStyle()} 
        key={hostId} 
        primaryText={props.name} 
        onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:hostId})}
        href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType:hostId})}
        initiallyOpen={true}
        nestedItems={nestedItems}/>;
}

export let HostTypeMenuItem = connect<StateProps, {}, {}>(makeMapStatToProps)(HostTypeMenuItemImpl);
