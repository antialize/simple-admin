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
}

const makeMapStatToProps = () => {
    const getId = (_:IMainState, props: ExternProps) => props.id;
    const getStatuses = (state:IMainState) => state.status;
    const getStatus = createSelector([getStatuses, getId], (status, id) => {
        return status[id];
    });
    const getUp = createSelector([getStatus], (status) => status && status.up);
    return createSelector([getId, getUp], (id:number, up: boolean) => {
        return {id, up}
    });
}

const HostMenuItemImpl = observer((props:StateProps) => {
    const name = state.objectDigests.get(hostId).get(props.id).name;
    let messages = 0;
    for (let [id, msg] of state.messages)
        if (!msg.dismissed && msg.host == props.id)
            ++messages;
    return <ListItem 
            nestedLevel={1}
            primaryText={name}
            style={debugStyle({color:props.up?"black":"red"})}
            key={props.id}
            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}
            rightAvatar={messages?(<Avatar color="black" backgroundColor="red">{messages}</Avatar>):null}
            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: props.id, version:null})}/>;
});

export let HostMenuItem = connect<StateProps, {}, ExternProps>(makeMapStatToProps)(HostMenuItemImpl);
