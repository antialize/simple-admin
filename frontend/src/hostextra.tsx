import * as React from "react";
import {Status} from "./status"
import {IStatus, IService} from '../../shared/status';
import {IMainState} from './reducers';
import {ISetServiceListFilter, IPokeService, SERVICE_POKE, ACTION} from '../../shared/actions'
import { connect, Dispatch } from 'react-redux';
import {Box} from './box'
import {Services} from './services'
import {HostTerminals} from './terminal'

interface ExternProps {
    id: number;
}
function mapStateToProps(state:IMainState, props:ExternProps): IStatus {
    return state.status[props.id]
}

export function SpecificStatusImpl(props:IStatus) {
    return <Status status={props}/>
}

export let SpecificStatus = connect(mapStateToProps)(SpecificStatusImpl);


export function HostExtra(props:ExternProps) {
    return (
        <div>
            <Box title="Status" collapsable={true} expanded={true}>
                <SpecificStatus id={props.id} />
            </Box>
            <Box title="Services" collapsable={true}>
                <Services id={props.id}/>
            </Box>
            <Box title="Terminal" collapsable={true}>
                <HostTerminals id={props.id} />
            </Box>
        </div>)
}

