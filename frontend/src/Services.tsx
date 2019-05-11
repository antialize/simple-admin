import * as React from "react";
import Button from "@material-ui/core/Button";
import Log from './Log';
import TextField from "@material-ui/core/TextField";
import state from "./state";
import { IPokeService, SERVICE_POKE, ACTION } from '../../shared/actions';
import { IService } from '../../shared/status';
import { StyleRules, StyledComponentProps } from "@material-ui/core/styles/withStyles";
import { observer } from "mobx-react";
import { withStyles, Theme, createStyles } from "@material-ui/core";
import nullCheck from '../../shared/nullCheck';

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        th: {
            color: theme.palette.text.primary
        },
        tr: {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary
        }});
}

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

    
function ServiceImpl({ service, poke, logVisible, setLogVisibility, classes }: { service: IService, poke: (name: string, poke: SERVICE_POKE) => void, logVisible: boolean, setLogVisibility: (visibility: boolean) => void } & StyledComponentProps) {
    let actions = [];
    if (service.activeState == "active") {
        actions.push(<Button variant="contained" color="secondary" key="stop" onClick={() => { if (confirm("Stop service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }}>Stop</Button>);
        actions.push(<Button variant="contained" color="secondary" key="kill" onClick={() => { if (confirm("Kill service " + service.name + "?")) poke(service.name, SERVICE_POKE.Kill); }} style={{ marginRight: "5px" }}>Kill</Button>);
        actions.push(<Button variant="contained" color="secondary" key="restart" onClick={() => { if (confirm("Restart service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }}>Restart</Button>);
        actions.push(<Button variant="contained" color="primary" key="reload" onClick={() => { poke(service.name, SERVICE_POKE.Reload); }} style={{ marginRight: "5px" }}>Reload</Button>);
    } else {
        actions.push(<Button variant="contained" color="primary"  key="start" onClick={() => { poke(service.name, SERVICE_POKE.Start); }} style={{ marginRight: "5px" }}>Start</Button>);
    }
    if (logVisible)
        actions.push(<Button variant="contained" color="primary"  key="log" onClick={() => setLogVisibility(false)} style={{ marginRight: "5px" }}>Hide log</Button>);
    else
        actions.push(<Button variant="contained" color="primary"  key="log" onClick={() => setLogVisibility(true)} style={{ marginRight: "5px" }}>Show log</Button>);
    return (
        <tr key={service.name} className={nullCheck(classes).tr}>
            <td>{service.name}</td>
            <td>{service.activeState}</td>
            <td>{service.StatusText}</td>
            <td>{actions}</td>
        </tr>
    )
}

const Service = withStyles(styles)(ServiceImpl);

function ServiceLog({ host, service }: { host: number, service: string }) {
    return (<tr key={"hat_" + service}>
        <td colSpan={4}>
            <Log host={host} type="journal" unit={service} />
        </td>
    </tr>)
}



const ServicesImpl = observer(function Services({id, classes}: {id:number} & StyledComponentProps) {
    if (!state.status.has(id)) return null;
    const filter = state.serviceListFilter.get(id) || "";
    let lvs = state.serviceLogVisibility.get(id);
    if (lvs === undefined) {
        lvs = new Map();
        state.serviceLogVisibility.set(id, lvs);
    }
    
    const status = state.status.get(id);
    if (!status) return null;

    const services = status.services;
    const serviceNames = [];
    for (let [key, _] of services) {
        if (filter == "" 
            ? (!boring.has(key) && !key.startsWith("ifup@")) 
            : key.indexOf(filter) == -1)
             continue;
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
        if (!service) continue;
        const lv = lvs.get(service.name) || false;
        rows.push(<Service key={"service_" + service.name} service={service} poke={pokeService} logVisible={lv} setLogVisibility={(b:boolean)=>lvs && lvs.set(service.name, b)} />);
        if (lv)
            rows.push(<ServiceLog key={"log_" + service.name} host={id} service={service.name} />);
    }
    const cls = nullCheck(classes);
    return (
        <div>
            <TextField placeholder="Filter" onChange={(e) => state.serviceListFilter.set(id, e.target.value)} value={filter} />
            <table>
                <thead>
                    <tr className={cls.tr}>
                        <th className={cls.th}>Name</th><th className={cls.th}>Status</th><th className={cls.th}>Message</th><th className={cls.th}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>)
});

const Services = withStyles(styles)(ServicesImpl);
export default Services;
