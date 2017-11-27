import * as React from "react";
import {IMainState} from './reducers';
import {hostId} from '../../shared/type'
import {connect, Dispatch } from 'react-redux';
import RaisedButton from 'material-ui/RaisedButton';
import {Log} from './log'
import {Box} from './box';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {Message} from './message';
import {MessageGroup} from './messageGroup';

interface ExternProps {
    host?: number;
}

interface MGroup {
    ids : number[];
    start : number;
    end : number;
    dismissed: number;
}


interface StateProps {
    messageGroups: MGroup[];
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

        let messageGroups: MGroup[] = [];
        for (const m of messages) {
            const t = msgs[m.id];            
            if (messageGroups.length == 0) {
                messageGroups.push({ids:[m.id], start: m.time, end:m.time, dismissed: t.dismissed?1:0});
                continue;
            }
            const g = messageGroups[messageGroups.length-1];
            const o = msgs[g.ids[0]];
            if (o.host != t.host || o.type != t.type || o.subtype != t.subtype) {
                messageGroups.push({ids:[m.id], start: m.time, end:m.time, dismissed: t.dismissed?1:0});
            } else {
                g.end = m.time;
                if (t.dismissed) g.dismissed += 1;
                g.ids.push(m.id);
            }
        }
        return {messageGroups, count};
    });
};

function MessagesImpl(p:StateProps) {
    let title;
    if (p.count == 0) 
        title = <span style={{color: "green"}}>Messages</span>;
    else        
        title = <span style={{color: "red"}}>Messages ({p.count})</span>;
    let messages = [];
    for (const group of p.messageGroups) {
        let id = group.ids[0];
        if (group.ids.length == 1) {
            messages.push(<Message id={id} key={id} />);
        } else {
            messages.push(<MessageGroup key={id} ids={group.ids} start={group.start} end={group.end} dismissed={group.dismissed}/>)
        }
    }
    return <Box title={title} expanded={p.count != 0} collapsable={true}>
            <table className="message_table" style={debugStyle()}>
                <thead>
                    <tr><th>Type</th><th>Host</th><th>Message</th><th>Time</th><th>Action</th></tr>
                </thead>
                <tbody>{messages}</tbody></table>
        </Box>
}

export let Messages = connect<StateProps, null, ExternProps>(makeMapStatToProps)(MessagesImpl);
