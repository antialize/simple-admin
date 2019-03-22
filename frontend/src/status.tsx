import * as React from "react";
import { Size } from './size';
import { Time } from './time';

import { InformationList, InformationListRow } from './information_list';
import Chart from './chart';
import { observer } from "mobx-react";
import state from "./state";
import LinearProgress from "@material-ui/core/LinearProgress";
import { Typography } from "@material-ui/core";

//import {ChartOptions, LinearTickOptions} from 'chart.js'

export default observer(({id}:{id:number}) => {
    const s = state.status.get(id);
    if (s == null || !s.up)
        return <Typography color="error">Down</Typography>;

    let lst: JSX.Element[] = [];
    for (const [target, mount] of s.mounts) {
        const block_size = 512;
        lst.push(
            <InformationListRow key={mount.src} name={mount.src + " at " + mount.target}>
                <Typography>
                    <Size size={(mount.blocks - mount.free_blocks) * mount.block_size} />
                    <span> of </span>
                    <Size size={mount.blocks * mount.block_size} /><br />
                    <LinearProgress variant="determinate" value={(mount.blocks - mount.free_blocks)*100/mount.blocks} />
                </Typography>
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
            <LinearProgress variant="determinate" value={(s.meminfo.swap_total - s.meminfo.swap_free)*100/s.meminfo.swap_total} />
        </span>);

    return (
        <div style={{ display: 'flex', flexDirection: 'row' }}>
            <div style={{ width: "250px" }}>
                <InformationList>
                    <InformationListRow name="Hostname"><Typography>{s.uname?s.uname.nodename:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Kernel"><Typography>{s.uname?s.uname.release:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Dist"><Typography>{s.lsb_release?s.lsb_release.id+" "+s.lsb_release.release+" "+s.lsb_release.codename:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Uptime"><Typography><Time seconds={s.uptime?s.uptime.total:0} /></Typography></InformationListRow>
                    <InformationListRow name="Loadavg"><Typography>{s.loadavg?s.loadavg.minute:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Memory"><Typography>
                        <Size size={s.meminfo?s.meminfo.total - s.meminfo.free:0} /><span> of </span><Size size={s.meminfo?s.meminfo.total:0} /><br /></Typography>
                    </InformationListRow>
                    <InformationListRow name="Swap"><Typography>{swap}</Typography></InformationListRow>
                    {lst}
                </InformationList>
            </div>
            <Chart initialZoom={20} style={{flex:1, marginLeft: 20, marginRight: 10, minHeight: '270px'}} host={id}/>
        </div>)
});
