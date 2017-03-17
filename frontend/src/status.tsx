import * as React from "react";
import { connect, Dispatch } from 'react-redux';
import LinearProgress from 'material-ui/LinearProgress';
import {Size} from './size';
import {Time} from './time';
import {IMainState} from './reducers';
import {IStatus, IStatuses} from '../../shared/status';
import * as State from '../../shared/state';
import {InformationList, InformationListRow} from './information_list';
import * as page from './page'

interface Props {
    status:IStatus;
}

export function Status({status:s}:Props) {
    let lst = s.mounts.map((mount:any)=>{
            return (
                <InformationListRow key={mount.src} name={mount.src + " at "+mount.target}>
                    <Size size={mount.free_blocks * mount.block_size} />
                    <span> of </span>
                    <Size size={mount.blocks * mount.block_size} /><br/>
                    <LinearProgress mode="determinate" value={mount.free_blocks} max={mount.blocks} />
                </InformationListRow>);
        });
    return (
        <div>
            <InformationList>
                <InformationListRow name="Hostname">{s.uname.nodename}</InformationListRow>
                <InformationListRow name="Kernel">{s.uname.release}</InformationListRow>
                <InformationListRow name="Dist">{s.lsb_release.id} {s.lsb_release.release} {s.lsb_release.codename}</InformationListRow>
                <InformationListRow name="Uptime"><Time seconds={s.uptime.total} /></InformationListRow>
                <InformationListRow name="Loadavg">{s.loadavg.minute}</InformationListRow>
                <InformationListRow name="Memory">
                    <Size size={s.meminfo.free} /><span> of </span><Size size={s.meminfo.total} /><br />
                    <LinearProgress mode="determinate" value={s.meminfo.free} max={s.meminfo.total} />
                </InformationListRow>
                <InformationListRow name="Swap">
                    <Size size={s.meminfo.swap_free} /><span> of </span><Size size={s.meminfo.swap_total} /><br />
                    <LinearProgress mode="determinate" value={s.meminfo.swap_free} max={s.meminfo.swap_total} />
                </InformationListRow>
                {lst}
            </InformationList>
        </div>)
}

interface StatusesProps {
    hosts: State.INameIdPair[];
    statuses: IStatuses;
    setPage: (e: React.MouseEvent<{}>, p: State.IPage) => void; 
}

function mapStateToProps(state:IMainState) {
    return {'hosts': state.objectNamesAndIds['host'], 'statuses': state.status};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {page.onClick(e, p, dispatch);
        }
    }    
}

function StatusesImpl(p: StatusesProps) {
    let hosts = (p.hosts)?p.hosts.map((v)=>v): [];
    hosts.sort((a,b) => a.name < b.name ? -1 : 1);
    return (
        <div>
            {hosts.map( pp=> {
                let a: State.IPage = {type:State.PAGE_TYPE.Object, class: 'host', id: pp.id, version:null};
                let elm;
                if (pp.name in p.statuses)
                    elm = <Status status={p.statuses[pp.name]} />
                else
                    elm = <span>DOWN</span>

                return (<div key={pp.name}>
                    <h1><a href={page.link(a)} onClick={(e)=>p.setPage(e, a)}>{pp.name}</a></h1>
                    {elm}
                    </div>)
            })}
        </div>
    )
}

export let Statuses = connect(mapStateToProps, mapDispatchToProps)(StatusesImpl);
