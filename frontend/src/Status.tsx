import * as React from "react";
import Chart from './Chart';
import LinearProgress from "@material-ui/core/LinearProgress";
import Size from './Size';
import Time from './Time';
import state from "./state";
import { InformationList, InformationListRow } from './InformationList';
import { Typography } from "@material-ui/core";
import { observer } from "mobx-react";
import { hostId } from "../../shared/type";

const Status = observer(function Status({id}:{id:number}) {
    const s = state.status.get(id);
    if (s == null || !s.up)
        return <Typography color="error">Down</Typography>;

    let lst: JSX.Element[] = [];
    for (const [, mount] of s.mounts) {
        lst.push(
            <InformationListRow key={mount.src + " at " + mount.target} name={mount.target} title={
                "device: " + mount.src +
                "\nmount point: "+ mount.target +
                "\nfiles: " + mount.files +
                "\nfree files: " + mount.free_files +
                "\navail files: " + mount.avail_files +
                "\nblocks: " + mount.blocks +
                "\nfree blocks: " + mount.free_blocks +
                "\navail blocks: " + mount.avail_blocks +
                "\nblock size: " + mount.block_size +
                "\ntype: " + mount.fstype
                }>
                <Typography>
                    <Size size={(mount.blocks - mount.free_blocks) * mount.block_size} />
                    <span> of </span>
                    <Size size={mount.blocks * mount.block_size} /><br />
                </Typography>
                <LinearProgress variant="determinate" value={(mount.blocks - mount.free_blocks)*100/mount.blocks} />
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

    let swap = (s.meminfo.swap_total == 0)
        ? <Typography>None</Typography>
        : (<span>
            <Typography><Size size={s.meminfo.swap_total - s.meminfo.swap_free} /><span> of </span><Size size={s.meminfo.swap_total} /></Typography><br />
            <LinearProgress variant="determinate" value={(s.meminfo.swap_total - s.meminfo.swap_free)*100/s.meminfo.swap_total} />
        </span>);

    let comment = "";
    const hosts = state.objectDigests.get(hostId);
    if (hosts) {
        let obj = hosts.get(id);
        if (obj) comment = obj.comment;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'row' }}>
            <div style={{ width: "250px" }}>
                <InformationList>
                    <InformationListRow name="Hostname"><Typography>{s.uname?s.uname.nodename:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Comment"><Typography>{comment}</Typography></InformationListRow>
                    <InformationListRow name="Kernel" title={
                        s.uname ? "release: " + s.uname.release +
                        "\nnodename: " + s.uname.nodename +
                        "\nmachine: " + s.uname.machine +
                        "\nsysname: " + s.uname.sysname +
                        "\nversion: " + s.uname.version : undefined
                    }><Typography>{s.uname?s.uname.release:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Dist" title={
                        s.lsb_release ? "id: " + s.lsb_release.id +
                        "\nrelease: " + s.lsb_release.release +
                        "\ncodename: " + s.lsb_release.codename +
                        "\ndescription: " + s.lsb_release.description : undefined
                    }><Typography>{s.lsb_release?s.lsb_release.id+" "+s.lsb_release.release+" "+s.lsb_release.codename:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Uptime" title={
                        s.uptime ? "total: " + s.uptime.total +
                        "\nidle: " + s.uptime.idle : undefined
                    }><Typography><Time seconds={s.uptime?s.uptime.total:0} /></Typography></InformationListRow>
                    <InformationListRow name="Loadavg" title={
                        s.loadavg ? "1 minute: " + s.loadavg.minute +
                        "\n5 minutes: " + s.loadavg.five_minute +
                        "\n10 minutes: " + s.loadavg.ten_minute +
                        "\ntotal processes: " + s.loadavg.total_processes +
                        "\nactive processes: " + s.loadavg.active_processes : undefined
                    }><Typography>{s.loadavg?s.loadavg.minute:"unknown"}</Typography></InformationListRow>
                    <InformationListRow name="Memory"><Typography>
                        <Size size={s.meminfo?s.meminfo.total - s.meminfo.free:0} /><span> of </span><Size size={s.meminfo?s.meminfo.total:0} /></Typography><br />
                    </InformationListRow>
                    <InformationListRow name="Swap">{swap}</InformationListRow>
                    {lst}
                </InformationList>
            </div>
            <Chart initialZoom={20} style={{flex:1, marginLeft: 20, marginRight: 10, minHeight: '350px'}} host={id}/>
        </div>)
});

export default Status;