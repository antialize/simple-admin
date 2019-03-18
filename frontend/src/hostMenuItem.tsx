import * as React from "react";
import { ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {connect} from 'react-redux'
import { hostId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect'
import Avatar from 'material-ui/Avatar';
import state from "./state";
import { observer } from "mobx-react";

interface ExternProps {
    id: number;
}

interface StateProps {
    id: number;
    up: boolean;
    messages: number;
}

const makeMapStatToProps = () => {
    const getId = (_:IMainState, props: ExternProps) => props.id;
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
    return createSelector([getId, getUp, getMessageCount], (id:number, up: boolean, messages: number) => {
        return {id, up, messages}
    });
}

const HostMenuItemImpl = observer((props:StateProps) => {
    const name = state.objectDigests.get(hostId).get(props.id).name;
    return <ListItem 
            nestedLevel={1}
            primaryText={name}
            style={debugStyle({color:props.up?"black":"red"})}
            key={props.id}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}
            rightAvatar={props.messages?(<Avatar color="black" backgroundColor="red">{props.messages}</Avatar>):null}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}/>;
});

export let HostMenuItem = connect<StateProps, {}, ExternProps>(makeMapStatToProps)(HostMenuItemImpl);
