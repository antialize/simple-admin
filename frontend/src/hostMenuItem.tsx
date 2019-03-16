import * as React from "react";
import { ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as page from './page'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect'
import Avatar from 'material-ui/Avatar';
import state from "./state";

interface ExternProps {
    id: number;
}

interface StateProps {
    name: string;
    id: number;
    up: boolean;
    messages: number;
}

const makeMapStatToProps = () => {
    const getHosts = (state:IMainState) => state.objectDigests[hostId] || [];
    const getId = (_:IMainState, props: ExternProps) => props.id;
    const getHost = createSelector([getHosts, getId], (hosts, id) => {
        return hosts.find(host => host.id == id);
    });
    const getStatuses = (state:IMainState) => state.status;
    const getStatus = createSelector([getStatuses, getId], (status, id) => {
        return status[id];
    });
    const getUp = createSelector([getStatus], (status) => status && status.up);
    const getMessages = (state:IMainState) => state.messages || {};
    const getMessageCount = createSelector([getMessages, getId], (messages, id) => {
        let cnt = 0;
        for (const i in messages) {
            const message = messages[i];
            if (message.dismissed || message.host != id) continue;
            cnt++;
        }
        return cnt;
    });
    return createSelector([getId, getHost, getUp, getMessageCount], (id:number, host: State.IObjectDigest , up: boolean, messages: number) => {
        return {id, up, messages, name: host.name}
    });
}



function HostMenuItemImpl(props:StateProps) {
    return <ListItem 
            nestedLevel={1}
            primaryText={props.name}
            style={debugStyle({color:props.up?"black":"red"})}
            key={props.id}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}
            rightAvatar={props.messages?(<Avatar color="black" backgroundColor="red">{props.messages}</Avatar>):null}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}/>;
}

export let HostMenuItem = connect<StateProps, {}, ExternProps>(makeMapStatToProps)(HostMenuItemImpl);
