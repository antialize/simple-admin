import * as React from "react";
import {IMainState} from '../reducers';
import {connect} from 'react-redux'

interface StateProps {
    logClearCount: number;
    log: string[];
}

function mapStateToProps(s:IMainState, {}): StateProps {
    return {log:s.deployment.log, logClearCount: s.deployment.logClearCount};
}

let theTerm = new Terminal({cursorBlink: false, scrollback: 100000});
let oldCount: number = 0;
let clearCount: number = 0;

export class LogImpl extends React.Component<StateProps, {}> {
    div: HTMLDivElement = null;
    interval: number;

    componentDidMount() {
        theTerm.open(this.div);
        theTerm.fit();
    }

    render() {
        if (this.props.logClearCount != clearCount) {
            theTerm.clear();
            clearCount = this.props.logClearCount;
            oldCount = 0;
        }
        
        for (;oldCount < this.props.log.length; ++oldCount)
            theTerm.write(this.props.log[oldCount])

        return <div className="deployment_log" ref={(div)=>this.div=div}/>
    }
}

export const Log = connect(mapStateToProps)(LogImpl);
export default Log;