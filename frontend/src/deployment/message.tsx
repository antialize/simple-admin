import * as React from "react";
import {IMainState, IDeploymentState} from '../reducers';
import * as State from '../../../shared/state'
import {connect} from 'react-redux'

import * as page from '../page'
import CircularProgress from 'material-ui/CircularProgress';
import Buttons from '../deployment/buttons';
import Header from '../deployment/header';

interface StateProps {
    message: string;
}

function mapStateToProps(s:IMainState, {}): StateProps {
    return {message: s.deployment.message}
}

function MessagesImpl(props:StateProps) {
    return (
	    <div className="deployment_message">{props.message?<ul>{props.message.split("\n").map(v=><li>{v}</li>)}</ul>:null}</div>
        );
}

export const Message = connect(mapStateToProps)(MessagesImpl);
export default Message;