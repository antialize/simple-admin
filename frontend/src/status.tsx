import * as React from "react";
import { connect, Dispatch } from 'react-redux';
import LinearProgress from 'material-ui/LinearProgress';
import { Size } from './size';
import { Time } from './time';
import { IMainState } from './reducers';
import { IStatus, IStatuses } from '../../shared/status';
import * as State from '../../shared/state';
import { InformationList, InformationListRow } from './information_list';
import * as page from './page'
import { Line } from 'react-chartjs-2'
import { Box } from './box'
import RaisedButton from 'material-ui/RaisedButton';
import GridList from 'material-ui/GridList/GridList';
import GridTile from 'material-ui/GridList/GridTile';
import { Card, CardActions, CardHeader, CardTitle, CardText } from 'material-ui/Card';
interface Props {
    status: IStatus;
}

export class Status extends React.Component<Props, {}> {
    render() {
        const s = this.props.status;
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

        const options = {
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
                        ticks: {
                            beginAtZero: true,
                            suggestedMax: 100.0,
                            callback: function(label: number, index: number, labels: any) {
                                return label + '%';
                            }
                        }
                    },
                    {
                        id: 'io',
                        gridLines: { display: false },
                        ticks: {
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
                        },
                        position: 'right',
                    },
                ]
            }
        };
	let swap = (s.meminfo.swap_total == 0)
		 ? <span>None</span>
		 : (<span>
		     <Size size={s.meminfo.swap_free} /><span> of </span><Size size={s.meminfo.swap_total} /><br />
		     <LinearProgress mode="determinate" value={s.meminfo.swap_free} max={s.meminfo.swap_total} />
		 </span>);
	
        return (
            <div style={{ display: 'flex', flexDirection: 'row' }}>
                <div style={{ width: "250px" }}>
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
                        <InformationListRow name="Swap">{swap}</InformationListRow>
                        {lst}
                    </InformationList>
                </div>
                <div style={{ flex: 1, marginLeft: 20, minHeight: '270px' }}>
                    <Line data={data} options={options} />
                </div>
            </div>)
    }
}

interface StatusesProps {
    hosts: State.INameIdPair[];
    statuses: IStatuses;
    setPage: (e: React.MouseEvent<{}>, p: State.IPage) => void;
}

function mapStateToProps(state: IMainState) {
    return { 'hosts': state.objectNamesAndIds['host'], 'statuses': state.status };
}

function mapDispatchToProps(dispatch: Dispatch<IMainState>) {
    return {
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }
}

function StatusesImpl(p: StatusesProps) {
    let hosts = (p.hosts) ? p.hosts.map((v) => v) : [];
    hosts.sort((a, b) => a.name < b.name ? -1 : 1);
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(700px, 1fr))', width: "100%"
        }}>
            {hosts.map(pp => {
                let a: State.IPage = { type: State.PAGE_TYPE.Object, class: 'host', id: pp.id, version: null };
                let elm;
                if (p.statuses[pp.id] && p.statuses[pp.id].up)
                    elm = <Status status={p.statuses[pp.id]} />;
                else
                    elm = <div>Down</div>;

                return (
                    <Card style={{ margin: '5px' }}>
                        <CardTitle title={pp.name} />
                        <CardText>{elm}</CardText>
                        <CardActions>
                            <RaisedButton onClick={(e) => p.setPage(e, a)} label="Details" href={page.link(a)} />
                        </CardActions>
                    </Card>);
            })}
        </div >);

    /*  return (
        {/* <div>
            {hosts.map( pp=> {
            let a: State.IPage = {type:State.PAGE_TYPE.Object, class: 'host', id: pp.id, version:null};
            let elm;
            if (p.statuses[pp.id] && p.statuses[pp.id].up)
            elm = <Status status={p.statuses[pp.id]} />
            else
            elm = <div>Down</div>

            return (<Box key={pp.name}
            title={pp.name}
            expanded={true}
            collapsable={true}
            >
            {elm}
            <RaisedButton onClick={(e)=>p.setPage(e, a)} label="Details" href={page.link(a)} />
            </Box>)
            })}
            </div>   }
    )*/
}

export let Statuses = connect(mapStateToProps, mapDispatchToProps)(StatusesImpl);
