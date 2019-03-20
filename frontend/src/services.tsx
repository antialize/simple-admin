import * as React from "react";
import {  IService } from '../../shared/status';
import { IPokeService, SERVICE_POKE, ACTION } from '../../shared/actions'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import { Log } from './log'
import { observer } from "mobx-react";
import state from "./state";

let boring = new Set(
    ["ModemManager.service", "NetworkManager-wait-online.service", "accounts-daemon.service",
     "acpid.service", "alsa-restore.service", "alsa-state.service", "anacron.service",
     "apport.service", "apt-daily.service", "avahi-daemon.service", "avahi-dnsconfd.service",
     "binfmt-support.service", "bluetooth.service", "brltty.service", "cgproxy.service",
     "colord.service", "console-setup.service", "cups-browsed.service", "dns-clean.service",
     "emergency.service", "friendly-recovery.service", "getty-static.service", "gpu-manager.service",
     "grub-common.service", "hddtemp.service", "irqbalance.service", "keyboard-setup.service",
     "kmod-static-nodes.service", "nfs-config.service", "nfs-utils.service", "ondemand.service",
     "plymouth-quit-wait.service", "plymouth-quit.service", "plymouth-read-write.service",
     "plymouth-start.service", "polkitd.service", "pppd-dns.service", "rc-local.service",
     "rescue.service", "rpc-gssd.service", "rpcbind.service", "rtkit-daemon.service",
     "setvtrgb.service", "snapd.autoimport.service", "snapd.refresh.service", "snapd.service",
     "speech-dispatcher.service", "syslog.service", "systemd-ask-password-console.service",
     "systemd-ask-password-plymouth.service", "systemd-ask-password-wall.service",
     "systemd-binfmt.service", "systemd-fsck-root.service", "systemd-fsckd.service",
     "systemd-hwdb-update.service", "systemd-initctl.service", "systemd-journal-flush.service",
     "systemd-journald.service", "systemd-logind.service", "systemd-machine-id-commit.service",
     "systemd-modules-load.service", "systemd-networkd-resolvconf-update.service",
     "systemd-networkd.service", "systemd-random-seed.service", "systemd-remount-fs.service",
     "systemd-rfkill.service", "systemd-sysctl.service", "systemd-timesyncd.service",
     "systemd-tmpfiles-clean.service", "systemd-tmpfiles-setup-dev.service", 
     "systemd-tmpfiles-setup.service", "systemd-udev-trigger.service", "systemd-udevd.service",
     "systemd-update-utmp-runlevel.service", "systemd-update-utmp.service",
     "systemd-user-sessions.service", "tlp.service", "udisks2.service", 
     "unattended-upgrades.service", "upower.service", "ureadahead-stop.service", 
     "ureadahead.service", "uuidd.service", "whoopsie.service", "hv-fcopy-daemon.service",
     "hv-kvp-daemon.service", "hv-vss-daemon.service", "iio-sensor-proxy.service",
     "plymouth-halt.service", "plymouth-reboot.service", "scsitools-pre.service",
     "scsitools.service", "systemd-halt.service", "systemd-hostnamed.service",
     "systemd-localed.service", "systemd-reboot.service", "systemd-resolved.service",
     "systemd-timedated.service", "atd.service", "cpufrequtils.service", "dm-event.service",
     "haveged.service", "kmod.service", "loadcpufreq.service", "lvm2-lvmetad.service", 
     "lvm2-lvmpolld.service", "lvm2-monitor.service", "rc.local.service", "urandom.service",
     "dbus.service", "cron.service", "rsyslog.service", "networking.service", "NetworkManager.service",
     "cgmanager.service", "thermald.service", "auth-rpcgss-module.service", "rpc-statd-notify.service",
     "rpc-statd.service", "rpc-svcgssd.service", "samba-ad-dc.service", "nfs-blkmap.service",
     "nfs-idmapd.service", "systemd-firstboot.service", "systemd-journal-catalog-update.service",
     "systemd-machined.service", "systemd-sysusers.service", "systemd-update-done.service",
     "systemd-vconsole-setup.service", "polkit.service", "ldconfig.service"]);

function Service({ service, poke, logVisible, setLogVisibility }: { service: IService, poke: (name: string, poke: SERVICE_POKE) => void, logVisible: boolean, setLogVisibility: (visibility: boolean) => void }) {
    let actions = [];
    if (service.activeState == "active") {
        actions.push(<RaisedButton key="stop" label="Stop" secondary={true} onClick={() => { if (confirm("Stop service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="kill" label="Kill" secondary={true} onClick={() => { if (confirm("Kill service " + service.name + "?")) poke(service.name, SERVICE_POKE.Kill); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="restart" label="Restart" secondary={true} onClick={() => { if (confirm("Restart service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="reload" label="Reload" primary={true} onClick={() => { poke(service.name, SERVICE_POKE.Reload); }} style={{ marginRight: "5px" }} />);
    } else {
        actions.push(<RaisedButton key="start" label="Start" primary={true} onClick={() => { poke(service.name, SERVICE_POKE.Start); }} style={{ marginRight: "5px" }} />);
    }
    if (logVisible)
        actions.push(<RaisedButton key="log" label="Hide log" primary={true} onClick={() => setLogVisibility(false)} style={{ marginRight: "5px" }} />);
    else
        actions.push(<RaisedButton key="log" label="Show log" primary={true} onClick={() => setLogVisibility(true)} style={{ marginRight: "5px" }} />);
    return (
        <tr key={service.name}>
            <td>{service.name}</td>
            <td>{service.activeState}</td>
            <td>{service.StatusText}</td>
            <td>{actions}</td>
        </tr>
    )
}

function ServiceLog({ host, service }: { host: number, service: string }) {
    return (<tr key={"hat_" + service}>
        <td colSpan={4}>
            <Log host={host} type="journal" unit={service} />
        </td>
    </tr>)
}

export default observer(({id}: {id:number}) => {
    if (!state.status.has(id)) return null;
    const filter = state.serviceListFilter.get(id) || "";
    const lvs = state.serviceLogVisibility.get(id);
    if (lvs === undefined) state.serviceLogVisibility.set(id, new Map());

    const services = state.status.get(id).services;
    const serviceNames = [];
    for (let [key, _] of services) {
        if (((!filter || filter == "") && !boring.has(key) && !key.startsWith("ifup@")) || key.indexOf(filter) != -1)
            serviceNames.push(key);
    }
    serviceNames.sort();

    const pokeService =  (name: string, poke: SERVICE_POKE) => {
        const p: IPokeService = {
            type: ACTION.PokeService,
            host: id,
            service: name,
            poke: poke
        };
        state.sendMessage(p);
    };

    let rows: JSX.Element[] = [];
    for (const key of serviceNames) {
        const service = services.get(key);
        const lv = lvs.get(service.name)
        rows.push(<Service key={"service_" + service.name} service={service} poke={pokeService} logVisible={lv} setLogVisibility={(b:boolean)=>lvs.set(service.name, b)} />);
        if (lv)
            rows.push(<ServiceLog key={"log_" + service.name} host={id} service={service.name} />);
    }
    return (
        <div>
            <TextField floatingLabelText="Filter" onChange={(a, v) => state.serviceListFilter.set(id, v)} value={filter} />
            <table className="services_table">
                <thead>
                    <tr>
                        <th>Name</th><th>Status</th><th>Message</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>)
});