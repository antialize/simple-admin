import * as React from "react";
import {IStatus} from '../../shared/status';
import {IMainState} from './reducers';
import { connect } from 'react-redux';

interface ExternProps {
    host: number;
}

interface StateProps {
    name: string;
    password: string;
}

function mapStateToProps(state:IMainState, props:ExternProps): StateProps {
    let c = state.objects[props.host].current;
    return {name: c.name, password: c.content.password}
}

function SetupImpl(p:StateProps ) {
    let host = window.location.hostname;
    let name = encodeURIComponent(p.name);
    let pwd = encodeURIComponent(p.password);
    return <pre>wget -q "https://{host}/setup.sh?host={name}&token={pwd}"  -O - | sudo bash</pre>
}

export let Setup = connect(mapStateToProps)(SetupImpl);
