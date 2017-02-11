import * as React from "react";
import { connect } from 'react-redux';
import LinearProgress from 'material-ui/LinearProgress';
import {Size} from './size';
import {Time} from './time';
import {IMainState} from './reducers';
import {IStatus, IStatuses} from '../../shared/status'

function Status({status:s}:{status:IStatus}) {
    let lst = s.mounts.map((mount:any)=>{
            return (<tr key={mount.src}>
                <td>{mount.src} at {mount.target}</td>
                <td>
                    <Size size={mount.free_blocks * mount.block_size} />
                    <span> of </span>
                    <Size size={mount.blocks * mount.block_size} /><br/>
                    <LinearProgress mode="determinate" value={mount.free_blocks} max={mount.blocks} />
                </td>
            </tr>);
        });
    return (
        <div>
            <table>              
                <tbody>
                    <tr><td>Hostname</td><td>{s.uname.nodename}</td></tr>
                    <tr><td>Kernel</td><td>{s.uname.release}</td></tr>
                    <tr><td>Dist</td><td>{s.lsb_release.id} {s.lsb_release.release} {s.lsb_release.codename}</td></tr>
                    <tr><td>Uptime</td><td><Time seconds={s.uptime.total} /></td></tr>
                    <tr><td>Loadavg</td><td>{s.loadavg.minute}</td></tr>
                    <tr><td>Memory</td><td>
                        <Size size={s.meminfo.free} /><span> of </span><Size size={s.meminfo.total} /><br />
                        <LinearProgress mode="determinate" value={s.meminfo.free} max={s.meminfo.total} />
                    </td></tr>
                    <tr><td>Swap</td><td>
                        <Size size={s.meminfo.swap_free} /><span> of </span><Size size={s.meminfo.swap_total} /><br />
                        <LinearProgress mode="determinate" value={s.meminfo.swap_free} max={s.meminfo.swap_total} />
                    </td></tr>
                    {lst}
                </tbody>
            </table>
        </div>)
}

function mapStateToProps(state:IMainState) {
    return {'status': state.status};
}

function Statuses({status: s}:{status: IStatuses}) {
    let names = Object.keys(s);
    names.sort();
    return (
        <div>
            {names.map(name=>{
                return (<div key={name}>
                    <h1>{name}</h1>
                    <Status status={s[name]} />
                </div>)
            })}
        </div>
    )
}

export let SStatuses = connect(mapStateToProps)(Statuses);
