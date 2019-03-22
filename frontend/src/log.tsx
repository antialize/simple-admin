import * as React from "react";
import {addActionTarget, removeActionTarget, sendMessage, ActionTarget} from './index'
import {IAction, ACTION, IStartLog, IEndLog} from '../../shared/actions'
import Typography from "@material-ui/core/Typography";

interface Props {
    type: 'dmesg' | 'file' | 'journal';
    unit?: string;
    host: number;   
}

/**
 * Display a log for a given host.
 * 
 * The log is maintaied by the component outside of redux, and even outside of react. For performance, 
 * new lines are simply added to the end of an ul.
 */
export class Log extends React.Component<Props, {}> implements ActionTarget {
    ul: HTMLUListElement;
    static nextId = 0;
    id: number;

    constructor(props:Props) {
        super(props);
        this.id = Log.nextId++;
    }

    handle(action:IAction) {
        if (action.type != ACTION.AddLogLines) return false;
        if (action.id != this.id) return false;

        const bottom = this.ul.scrollTop == this.ul.scrollHeight;
        this.ul.offsetTop
        for (const line of action.lines) {
            const li = document.createElement("li");
            li.textContent = line;
            this.ul.appendChild(li);
        }

        this.ul.scrollTop = this.ul.scrollHeight;
        return true;
    }

    componentDidMount() {
        const msg: IStartLog = {
            type: ACTION.StartLog,
            host: this.props.host,
            logtype: this.props.type,
            unit: this.props.unit,
            id: this.id
        };
        sendMessage(msg);
        addActionTarget(ACTION.AddLogLines, this);
    }

    componentWillUnmount() {
        const msg: IEndLog = {
            type: ACTION.EndLog,
            id: this.id,
            host: this.props.host
        }
        sendMessage(msg);
        removeActionTarget(ACTION.AddLogLines, this);
    }

    render() {
        return <Typography><ul ref={(ul)=>this.ul = ul} style={{margin:0, listStyleType: 'none', overflowY: 'scroll', overflowX: 'auto', maxHeight: '500px', padding: 0}}/></Typography>;
    }
}
