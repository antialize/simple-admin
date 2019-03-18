import * as React from "react";
import {IMainState} from './reducers';
import {ISetMessagesDismissed, ISetMessageExpanded, ACTION, IMessage, IMessageTextReqAction} from '../../shared/actions'
import {hostId} from '../../shared/type'
import {connect, Dispatch } from 'react-redux';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import RaisedButton from 'material-ui/RaisedButton';
import { observer } from "mobx-react";
import state from "./state";

interface ExternProps {
    id: number;
    inGroup?: boolean;
}

interface StateProps {
    message: IMessage;
    id: number;
    inGroup: boolean;
    expanded: boolean;
}

interface DispatchProps {
    setDismissed(dismissed:boolean): void;
    setExpanded(expanded:boolean, fetch:boolean): void;
}

const getMessages = (state:IMainState) => state.messages;

const makeMapStatToProps = () => {
    const getId = (_:IMainState, p: ExternProps) => p.id;
    const getInGroup = (_:IMainState, p: ExternProps) => p.inGroup;
    const getExpanded = (state:IMainState, p:ExternProps) => state.messageExpanded[p.id];
    return createSelector([getId, getInGroup, getExpanded, getMessages], (id, inGroup, expanded, messages)=> {
        return {message: messages[id], id, inGroup, expanded};
    });
};

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:ExternProps): DispatchProps {
    return {
        setDismissed: (dismissed: boolean) => {
            const p:ISetMessagesDismissed = {
                type: ACTION.SetMessagesDismissed,
                ids: [o.id],
                dismissed,
                source: "webclient"
            };
            dispatch(p);
        },
        setExpanded: (expanded: boolean, fetch:boolean) => {
            if (fetch) {
                const p:IMessageTextReqAction = {
                    type: ACTION.MessageTextReq,
                    id: o.id,
                };
                dispatch(p);
            }
            const p:ISetMessageExpanded = {
                type: ACTION.SetMessageExpanded,
                id: o.id,
                expanded,
            };
            dispatch(p);
        },
    }
}

const MessageImpl=observer((p:StateProps & DispatchProps) => {
    const hostname = state.objectDigests.get(hostId).get(p.message.id).name;
    const newDate = new Date(p.message.time * 1000);
    let actions = [];
    let c;


    if (p.message.dismissed) {
        actions.push(<RaisedButton key="undismiss" label="Undismiss" primary={true} onClick={()=>p.setDismissed(false)}/>);
        c = "message_good";
    } else {
        actions.push(<RaisedButton key="dismiss" label="Dismiss" primary={true} onClick={()=>p.setDismissed(true)}/>);
        c = "message_bad";
    }

    let msg = p.message.message;
    if (msg && msg.length > 999) {
        if (!p.expanded) {
            msg = msg.substr(0,999)+"...";
            actions.push(<RaisedButton key="expand" label="Full text" primary={true} onClick={()=>p.setExpanded(true, !p.message.fullMessage)}/>);
        } else {
            actions.push(<RaisedButton key="contract" label="Partial text" primary={true} onClick={()=>p.setExpanded(false, false)}/>);
        }
    }    
    return <tr style={debugStyle()} className={c} key={p.id}>{p.inGroup?<td colSpan={2} />:<td>{p.message.type}</td>}{p.inGroup?null:<td>{hostname}</td>}<td>{msg}</td><td>{newDate.toUTCString()}</td><td>{actions}</td></tr>;
});

export const Message = connect<StateProps, DispatchProps, ExternProps>(makeMapStatToProps, mapDispatchToProps)(MessageImpl);
