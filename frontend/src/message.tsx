import * as React from "react";
import {IMainState} from './reducers';
import {ISetMessageDismissed, ACTION, IMessage} from '../../shared/actions'
import {hostId} from '../../shared/type'
import {connect, Dispatch } from 'react-redux';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import RaisedButton from 'material-ui/RaisedButton';

interface ExternProps {
    id: number;
}

interface StateProps {
    message: IMessage;
    hostname: string;
    id: number;
}

interface DispatchProps {
    setDismissed(id:number, dismissed:boolean): void;
}

const getMessages = (state:IMainState) => state.messages;
const getHosts = (state:IMainState) => state.objectDigests[hostId] || [];
const getHostNames = createSelector([getHosts], (hosts) => {
    const hostNames: {[id:number]: string} = {}
    for (const p of hosts) hostNames[p.id] = p.name;
    return hostNames;
});

const makeMapStatToProps = () => {
    const getId = (_:IMainState, p: ExternProps) => p.id;
    return createSelector([getId, getMessages, getHostNames], (id, messages, hostNames)=> {
        return {message: messages[id], hostname:hostNames[messages[id].host], id};
    });
};

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:ExternProps): DispatchProps {
    return {
        setDismissed: (id:number, dismissed: boolean) => {
            const p:ISetMessageDismissed = {
                type: ACTION.SetMessageDismissed,
                id: id,
                dismissed: dismissed,
                source: "webclient"
            };
            dispatch(p);
        },
    }
}

function MessageImpl(p:StateProps & DispatchProps) {
    const newDate = new Date(p.message.time * 1000);
    let action;
    let c;
    if (p.message.dismissed) {
        action = <RaisedButton label="Undismiss" primary={true} onClick={()=>p.setDismissed(p.id, false)}/>;
        c = "message_good";
    } else {
        action = <RaisedButton label="Dismiss" primary={true} onClick={()=>p.setDismissed(p.id, true)}/>;
        c = "message_bad";
    }
    return <tr style={debugStyle()} className={c} key={p.id}><td>{p.message.type}</td><td>{p.hostname}</td><td>{p.message.message}</td><td>{newDate.toUTCString()}</td><td>{action}</td></tr>;
}

export const Message = connect<StateProps, DispatchProps, ExternProps>(makeMapStatToProps, mapDispatchToProps)(MessageImpl);
