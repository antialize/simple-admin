import * as React from "react";
import {IStatus, ISmartStatus} from '../../shared/status';
import {IMainState} from './reducers';
import { connect } from 'react-redux';

interface ExternProps {
    host: number;
}

interface StateProps {
    smart: {[dev:string]:ISmartStatus[]};
}

function mapStateToProps(state:IMainState, props:ExternProps): StateProps {
    return {smart: state.status[props.host].smart};
}


function SmartImpl(p:StateProps ) {
    let rows: JSX.Element[] = [];
    const importantSmart = new Set([5,103,171,172,175,176,181,182,184,187,188,191,197,198,200,221]);
    for (const dev in p.smart) {
        rows.push(<tr className="smart_device"><td colSpan={3}>{dev}</td></tr>);
        for (const status of p.smart[dev]) {
            let className=importantSmart.has(status.id)?(status.raw_value == 0?"smart_good":"smart_bad"):"smart_normal";
            rows.push(<tr className={className}><td>{status.id}</td><td>{status.name}</td><td>{status.raw_value}</td></tr>)
        }
    }
    return (
        <div>
            <table className="smart_table">
                <thead>
                    <tr>
                        <th>Id</th><th>Name</th><th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>)
}

export let Smart = connect(mapStateToProps)(SmartImpl);
