import * as React from "react";
import { connect, Dispatch } from 'react-redux';
import LinearProgress from 'material-ui/LinearProgress';
import { Size } from './size';
import { Time } from './time';
import { IMainState } from './reducers';
import { IStatus, IStatuses } from '../../shared/status';
import { hostId } from '../../shared/type';
import * as State from '../../shared/state';
import { InformationList, InformationListRow } from './information_list';
import * as page from './page'
import { Line } from 'react-chartjs-2'
import { Box } from './box'
import RaisedButton from 'material-ui/RaisedButton';
import GridList from 'material-ui/GridList/GridList';
import GridTile from 'material-ui/GridList/GridTile';
import { Card, CardActions, CardHeader, CardTitle, CardText } from 'material-ui/Card';
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {Chart} from './chart';

//import {ChartOptions, LinearTickOptions} from 'chart.js'


const getStatuses = (state:IMainState) => state.status;

interface ExternProps {
    id: number;
}

interface Props {
    id: number;
    status: IStatus;
}
const makeMapStatToProps: ()=>(sate: IMainState, props: ExternProps)=>Props = ()=> {
    const getId = (_:IMainState, props: ExternProps) => props.id;
    return createSelector([getId, getStatuses], (id, statuses)=> {return {id, status: statuses[id]}} );
}

function StatusImpl(props: Props) {
    const s = props.status;
    if (s == null || !s.up)
        return <div>Down</div>;

    let lst: JSX.Element[] = [];
    for (const target in s.mounts) {
        const mount = s.mounts[target];
        const block_size = 512;
        lst.push(
            <InformationListRow key={mount.src} name={mount.src + " at " + mount.target}>
                <Size size={(mount.blocks - mount.free_blocks) * mount.block_size} />
                <span> of </span>
                <Size size={mount.blocks * mount.block_size} /><br />
                <LinearProgress mode="determinate" value={mount.blocks - mount.free_blocks} max={mount.blocks} />
            </InformationListRow>);
    }

    let x = s.cpu.length - 1;

    let start = Math.max(0, x - 100);

    let labels: Date[] = [];
    let cpu: number[] = [];
    let netread: number[] = [];
    let netwrite: number[] = [];
    let diskread: number[] = [];
    let diskwrite: number[] = [];

    for (let i = start; i < x; ++i) {
        cpu.push((s.cpu[i + 1] - s.cpu[i]) * 100.0 / 5.0);
        netread.push((s.netread[i + 1] - s.netread[i]) / 5.0);
        netwrite.push((s.netwrite[i + 1] - s.netwrite[i]) / 5.0);
        diskread.push((s.diskread[i + 1] - s.diskread[i]) / 5.0);
        diskwrite.push((s.diskwrite[i + 1] - s.diskwrite[i]) / 5.0);
        labels.push(new Date(s.time[i + 1] * 1000));
    }
/*
    const data = {
        labels: labels,
        datasets: [
            {
                yAxisID: 'cpu',
                label: 'CPU Usage',
                fill: false,
                lineTension: 0.5,
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderColor: 'rgba(0,0,0,1)',
                borderWidth: 1.5,
                pointRadius: 0,
                data: cpu
            }, {
                yAxisID: 'io',
                label: 'Net Read',
                fill: false,
                lineTension: 0.5,
                backgroundColor: 'rgba(255,0,0,0.4)',
                borderColor: 'rgba(255,0,0,1)',
                borderWidth: 1.5,
                pointRadius: 0,
                data: netread,
            }, {
                yAxisID: 'io',
                label: 'Net Write',
                fill: false,
                lineTension: 0.5,
                backgroundColor: 'rgba(0,255,0,0.4)',
                borderColor: 'rgba(0,255,0,1)',
                borderWidth: 1.5,
                pointRadius: 0,
                data: netwrite,
            }, {
                yAxisID: 'io',
                label: 'Disk Read',
                fill: false,
                lineTension: 0.5,
                backgroundColor: 'rgba(0,0,255,0.4)',
                borderColor: 'rgba(0,0,255,1)',
                borderWidth: 1.5,
                pointRadius: 0,
                data: diskread,
            }, {
                yAxisID: 'io',
                label: 'Disk Write',
                fill: false,
                lineTension: 0.5,
                backgroundColor: 'rgba(0,255,255,0.4)',
                borderColor: 'rgba(0,255,255,1)',
                borderWidth: 1.5,
                pointRadius: 0,
                data: diskwrite,
            }
        ]
    };

    const cpuTicks: LinearTickOptions = {
        beginAtZero: true,
        suggestedMax: 100.0,
        callback: function(label: number, index: number, labels: any) {
            return label + '%';
        }
    }

    const ioTicks: LinearTickOptions = {
        beginAtZero: true,
        suggestedMax: 1024.0,
        callback: function(label: number, index: number, labels: any) {
            if (label < 1024)
                return label.toFixed(0) + "B/s";
            if (label < 1024 * 1024)
                return (label / 1024).toFixed(0) + "kB/s";
            if (label < 1024 * 1024 * 1024)
                return (label / 1024 / 1024).toFixed(0) + "MB/s";
            return (label / 1024 / 1024 / 1024).toFixed(0) + "GB/s";
        }
    }

    const options: ChartOptions = {
        animation: false,
        maintainAspectRatio: false,
        scales: {
            xAxes: [{
                type: 'time',
            }],
            yAxes: [
                {
                    id: 'cpu',
                    gridLines: { display: false },
                    ticks: cpuTicks
                },
                {
                    id: 'io',
                    gridLines: { display: false },
                    ticks: ioTicks,
                    position: 'right'
                }
            ]
        }
    };
*/
    let swap = (s.meminfo.swap_total == 0)
        ? <span>None</span>
        : (<span>
            <Size size={s.meminfo.swap_total - s.meminfo.swap_free} /><span> of </span><Size size={s.meminfo.swap_total} /><br />
            <LinearProgress mode="determinate" value={s.meminfo.swap_total - s.meminfo.swap_free} max={s.meminfo.swap_total} />
        </span>);

    return (
        <div style={debugStyle({ display: 'flex', flexDirection: 'row' })}>
            <div style={{ width: "250px" }}>
                <InformationList>
                    <InformationListRow name="Hostname">{s.uname?s.uname.nodename:"unknown"}</InformationListRow>
                    <InformationListRow name="Kernel">{s.uname?s.uname.release:"unknown"}</InformationListRow>
                    <InformationListRow name="Dist">{s.lsb_release?s.lsb_release.id+" "+s.lsb_release.release+" "+s.lsb_release.codename:"unknown"}</InformationListRow>
                    <InformationListRow name="Uptime"><Time seconds={s.uptime?s.uptime.total:0} /></InformationListRow>
                    <InformationListRow name="Loadavg">{s.loadavg?s.loadavg.minute:"unknown"}</InformationListRow>
                    <InformationListRow name="Memory">
                        <Size size={s.meminfo?s.meminfo.total - s.meminfo.free:0} /><span> of </span><Size size={s.meminfo?s.meminfo.total:0} /><br />
                    </InformationListRow>
                    <InformationListRow name="Swap">{swap}</InformationListRow>
                    {lst}
                </InformationList>
            </div>
            <Chart initialZoom={20} style={{flex:1, marginLeft: 20, marginRight: 10, minHeight: '270px'}} host={props.id}/>
        </div>)
};

export const Status = connect<Props, null, ExternProps>(makeMapStatToProps)(StatusImpl);
