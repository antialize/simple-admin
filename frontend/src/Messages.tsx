import * as React from "react";
import Box from './Box';
import Message from './Message';
import MessageGroup from './MessageGroup';
import Typography from "@material-ui/core/Typography";
import state from "./state";
import { observer } from "mobx-react";

interface MGroup {
    ids : number[];
    start : number;
    end : number;
    dismissed: number;
}

const Messages = observer(function Messages({host}: {host?:number}) {
    const messages: {id:number, time:number}[] = [];
    let count = 0;
    for (const [id, message] of state.messages) {
        if (host != null && message.host != host) continue;
        if (!message.dismissed) count++
        messages.push({id: message.id, time: message.time});
    };
    messages.sort((l,r)=>{
        return r.time - l.time;
    });

    let messageGroups: MGroup[] = [];
    for (const m of messages) {
        const t = state.messages.get(m.id);
        if (messageGroups.length == 0) {
            messageGroups.push({ids:[m.id], start: m.time, end:m.time, dismissed: t.dismissed?1:0});
            continue;
        }
        const g = messageGroups[messageGroups.length-1];
        const o = state.messages.get(g.ids[0]);
        if (o.host != t.host || o.type != t.type || o.subtype != t.subtype) {
            messageGroups.push({ids:[m.id], start: m.time, end:m.time, dismissed: t.dismissed?1:0});
        } else {
            g.end = m.time;
            if (t.dismissed) g.dismissed += 1;
            g.ids.push(m.id);
        }
    }

    let title;
    if (count == 0)
        title = <span style={{color: "#00CC00"}}>Messages</span>;
    else        
        title = <span style={{color: "red"}}>Messages ({count})</span>;
    let messageItems = [];
    for (const group of messageGroups) {
        let id = group.ids[0];
        if (group.ids.length == 1) {
            messageItems.push(<Message id={id} key={id} inGroup={false} />);
        } else {
            messageItems.push(<MessageGroup key={id} ids={group.ids} start={group.start} end={group.end} dismissed={group.dismissed}/>)
        }
    }
    return <Box title={title} expanded={count != 0} collapsable={true}>
            <table className="message_table">
                <thead>
                    <tr>
                        <th><Typography variant="body1" component="span">Type</Typography></th>
                        <th><Typography variant="body1" component="span">Host</Typography></th>
                        <th><Typography variant="title" component="span">Message</Typography></th>
                        <th><Typography variant="title" component="span">Time</Typography></th>
                        <th><Typography variant="title" component="span">Action</Typography></th></tr>
                </thead>
                <tbody>{messageItems}</tbody>
            </table>
        </Box>
});

export default Messages;
