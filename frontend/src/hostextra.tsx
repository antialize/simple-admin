import * as React from "react";
import {Status} from "./status"
import {IStatus, IService} from '../../shared/status';
import {IMainState} from './reducers';
import {ISetServiceListFilter, IPokeService, SERVICE_POKE, ACTION} from '../../shared/actions'
import { connect, Dispatch } from 'react-redux';
import {Box} from './box'
import {Services} from './services'
import {HostTerminals} from './terminal'
import {Log} from './log'
import {Smart} from './smart'
import Messages from './messages'
import Setup from './setup'

interface ExternProps {
    id: number;
}

interface IProps {
    id: number;
    down: boolean;
}

function mapStateToProps2(state:IMainState, props:ExternProps): IProps {
    return {id: props.id, down: state.status[props.id] == null || !state.status[props.id].up};
}

function HostExtraImpl(props:IProps) {
    let c: JSX.Element = null;
    if (!props.down) {
        c = (<div>
                <Box title="Smart" collapsable={true}>
                    <Smart host={props.id}/>
                </Box>
                <Box title="Services" collapsable={true}>
                    <Services id={props.id}/>
                </Box>
                <Box title="Terminal" collapsable={true}>
                    <HostTerminals id={props.id} />
                </Box>
                <Box title="Journal" collapsable={true}>
                    <Log type="journal" host={props.id} />
                </Box>
                <Box title="Dmesg" collapsable={true}>
                    <Log type="dmesg" host={props.id} />
                </Box>
            </div>
        )
    } else if (props.id > 0) {
        c = (
            <Box title="Setup" collapsable={false} expanded={true}>
               <Setup hostid={props.id} />
            </Box>);
    }

    return (
        <div>
            {props.id > 0 ? 
                <div>
                    <Messages host={props.id} />
                    <Box title="Status" collapsable={true} expanded={true}>
                        <Status id={props.id} />
                    </Box>
                </div>: null}
            {c}
        </div>)
}

export let HostExtra = connect(mapStateToProps2)(HostExtraImpl);


