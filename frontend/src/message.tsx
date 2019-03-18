import * as React from "react";
import {ISetMessagesDismissed, ACTION, IMessageTextReqAction} from '../../shared/actions'
import {hostId} from '../../shared/type'
import {debugStyle} from './debug';
import RaisedButton from 'material-ui/RaisedButton';
import { observer } from "mobx-react";
import state from "./state";

export default observer(({id, inGroup}: {id:number, inGroup:boolean}) => {
    const message = state.messages.get(id);
    const hostname = state.objectDigests.get(hostId).get(message.id).name;
    const newDate = new Date(message.time * 1000);

    const setDismissed = (dismissed: boolean) => {
        const p:ISetMessagesDismissed = {
            type: ACTION.SetMessagesDismissed,
            ids: [id],
            dismissed,
            source: "webclient"
        };
        state.sendMessage(p);
    };

    const setExpanded = (expanded: boolean, fetch:boolean) => {
        if (fetch) {
            const p:IMessageTextReqAction = {
                type: ACTION.MessageTextReq,
                id: id,
            };
            state.sendMessage(p);
        }
        state.messageExpanded.set(id, expanded);
    };

    let actions = [];
    let c;

    if (message.dismissed) {
        actions.push(<RaisedButton key="undismiss" label="Undismiss" primary={true} onClick={()=>setDismissed(false)}/>);
        c = "message_good";
    } else {
        actions.push(<RaisedButton key="dismiss" label="Dismiss" primary={true} onClick={()=>setDismissed(true)}/>);
        c = "message_bad";
    }

    let msg = message.message;
    if (msg && msg.length > 999) {
        if (!state.messageExpanded.get(id)) {
            msg = msg.substr(0,999)+"...";
            actions.push(<RaisedButton key="expand" label="Full text" primary={true} onClick={()=>setExpanded(true, !message.fullMessage)}/>);
        } else {
            actions.push(<RaisedButton key="contract" label="Partial text" primary={true} onClick={()=>setExpanded(false, false)}/>);
        }
    }    
    return <tr style={debugStyle()} className={c} key={id}>{inGroup?<td colSpan={2} />:<td>{message.type}</td>}{inGroup?null:<td>{hostname}</td>}<td>{msg}</td><td>{newDate.toUTCString()}</td><td>{actions}</td></tr>;
});

