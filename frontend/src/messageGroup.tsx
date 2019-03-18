import * as React from 'react';
import { ISetMessagesDismissed, ACTION, IMessage} from '../../shared/actions'
import {hostId} from '../../shared/type'
import {debugStyle} from './debug';
import RaisedButton from 'material-ui/RaisedButton';
import Message from './message';
import { observer } from 'mobx-react';
import state from './state';

export default observer(({ids, start, end, dismissed}: {ids:number[], start:number, end:number, dismissed: number}) => {
    const toggle = (dismissed: boolean) => {
        const p:ISetMessagesDismissed = {
            type: ACTION.SetMessagesDismissed,
            ids: ids,
            dismissed,
            source: "webclient"
        };
        state.sendMessage(p);
    };

    const id = ids[0];
    const message = state.messages.get(id);
    const hostname = state.objectDigests.get(hostId).get(message.host).name;
    const expanded = state.messageGroupExpanded.get(id) || false;

    const newDate = new Date(end * 1000);
    let actions = [];
    let c;
    if (dismissed != 0) {
        actions.push(<RaisedButton key="undismiss" label="Undismiss all" primary={true} onClick={()=>toggle(false)}/>);
        c = "message_good";
    }
    if (dismissed != ids.length) {
        actions.push(<RaisedButton key="dismiss" label="Dismiss all" primary={true} onClick={()=>toggle(true)}/>);
        c = "message_bad";
    }
    if (expanded)
        actions.push(<RaisedButton key="contract" label="Contract" primary={true} onClick={()=> state.messageGroupExpanded.set(id, false)}/>);
    else
        actions.push(<RaisedButton key="expand" label="Expand" primary={true} onClick={()=> state.messageGroupExpanded.set(id, false)}/>);
    
    let rows = [<tr style={debugStyle()} className={c} key={ids[0]+"_root"}><td>{message.type} ({ids.length})</td><td>{hostname}</td><td></td><td>{newDate.toUTCString()}</td><td>{actions}</td></tr>];
    if (expanded) {
        for (const id of ids) {
            rows.push(<Message key={id} inGroup={true} id={id}/>);
        }
    }
    return rows as any;
});

