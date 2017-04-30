import * as React from "react";
import {IMainState} from './reducers';
import {ISetMessageDismissed, ACTION, IMessage} from '../../shared/actions'
import {connect, Dispatch } from 'react-redux';
import RaisedButton from 'material-ui/RaisedButton';
import {Log} from './log'
import {Box} from './box';

interface ExternProps {
    host?: number;
}

interface StateProps {
    messages: (IMessage & {hostname: string})[];
    count: number;
}

interface DispatchProps {
    setDismissed(id:number, dismissed:boolean): void;
}

function mapStateToProps(state:IMainState, props:ExternProps): StateProps {
    const messages: (IMessage & {hostname: string})[] = [];
    const hostNames: {[id:number]: string} = {}
    let count = 0;
    if (state.objectNamesAndIds['host'])
	for (const p of state.objectNamesAndIds['host'])
            hostNames[p.id] = p.name;

    for (const id in state.messages) {
        const message = state.messages[id];
        if (props.host == null || message.host == props.host) {
            if (!message.dismissed) count++
            messages.push(Object.assign({hostname: hostNames[message.host]}, message));
        }
    }
    messages.sort((l,r)=>{
        //if (l.dismissed != r.dismissed) return l.dismissed?1:-1;
        return r.time - l.time;
    });
    return {messages, count};
}

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

function MessagesImpl(p:StateProps & DispatchProps) {
    const items = [];
    for (const m of p.messages) {
        const newDate = new Date(m.time * 1000);
        let action;
        let c;
        if (m.dismissed) {
            action = <RaisedButton label="Undismiss" primary={true} onClick={()=>p.setDismissed(m.id, false)}/>
            c = "message_good";
        } else {
            action = <RaisedButton label="Dismiss" primary={true} onClick={()=>p.setDismissed(m.id, true)}/>
            c = "message_bad";
        }
        items.push(<tr className={c} key={m.id}><td>{m.type}</td><td>{m.hostname}</td><td>{m.message}</td><td>{newDate.toUTCString()}</td><td>{action}</td></tr>);
    }
    let title;
    if (p.count == 0) 
        title = <span style={{color: "green"}}>Messages</span>;
    else        
        title = <span style={{color: "red"}}>Messages ({p.count})</span>;

    return <Box title={title} expanded={p.count != 0} collapsable={true}>
            <table className="message_table">
                <thead>
                    <tr><th>Type</th><th>Host</th><th>Message</th><th>Time</th><th>Action</th></tr>
                </thead>
                <tbody>{items}</tbody></table>
        </Box>
}

export let Messages = connect(mapStateToProps, mapDispatchToProps)(MessagesImpl);
