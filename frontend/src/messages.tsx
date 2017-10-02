import * as React from "react";
import {IMainState} from './reducers';
import {ISetMessageDismissed, ACTION, IMessage} from '../../shared/actions'
import {hostId} from '../../shared/type'
import {connect, Dispatch } from 'react-redux';
import RaisedButton from 'material-ui/RaisedButton';
import {Log} from './log'
import {Box} from './box';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {Message} from './message';

interface ExternProps {
    host?: number;
}

interface StateProps {
    messages: {id:number, time:number}[]; 
    count: number;
}

const getMessages = (state:IMainState) => state.messages;

const makeMapStatToProps = () => {
    const getHost = (_:IMainState, p: ExternProps) => p.host;
    return createSelector([getHost, getMessages], (host, msgs)=> {
        const messages: {id:number, time:number}[] = [];
        let count = 0;
        for (const id in msgs) {
            const message = msgs[id];
            if (host != null && message.host != host) continue;
            if (!message.dismissed) count++
            messages.push({id: message.id, time: message.time});
        };
        messages.sort((l,r)=>{
            return r.time - l.time;
        });
        return {messages, count};
    });
};

function MessagesImpl(p:StateProps) {
    let title;
    if (p.count == 0) 
        title = <span style={{color: "green"}}>Messages</span>;
    else        
        title = <span style={{color: "red"}}>Messages ({p.count})</span>;

    return <Box title={title} expanded={p.count != 0} collapsable={true}>
            <table className="message_table" style={debugStyle()}>
                <thead>
                    <tr><th>Type</th><th>Host</th><th>Message</th><th>Time</th><th>Action</th></tr>
                </thead>
                <tbody>{p.messages.map(m => <Message id={m.id} key={m.id}/>)}</tbody></table>
        </Box>
}

export let Messages = connect<StateProps, null, ExternProps>(makeMapStatToProps)(MessagesImpl);
