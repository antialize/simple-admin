import { ISmartStatus, IStatusUptime, IStatusMeminfo, IStatusLBSRelease, IStatusUname, IStatusLoadAVG, IStatusMount, IService, IStatus, IStatusUpdate, IStatusCpuinfo } from "../../shared/status";
import { observable, action } from "mobx";

class StatusState {
    @observable.shallow
    uptime: IStatusUptime = { total: 0, idle: 0 };
    @observable.shallow
    meminfo: IStatusMeminfo = { avail: 0, total: 0, free: 0, swap_free: 0, swap_total: 0 };
    @observable.shallow
    cpuinfo: IStatusCpuinfo = { name: "", cores: 0, geekbench_multi: 0, geekbench_single: 0 };
    @observable.shallow
    lsb_release: IStatusLBSRelease = { release: "", codename: "", id: "", description: "" };
    @observable.shallow
    uname: IStatusUname = { release: "", sysname: "", machine: "", version: "", nodename: "" };
    @observable.shallow
    loadavg: IStatusLoadAVG = { five_minute: 0, active_processes: 0, ten_minute: 0, minute: 0, total_processes: 0 };
    @observable
    mounts: Map<string, IStatusMount> = new Map;
    @observable
    services: Map<string, IService> = new Map;
    @observable
    diskread: number[] = [];
    @observable
    diskwrite: number[] = [];
    @observable
    netread: number[] = [];
    @observable
    netwrite: number[] = [];
    @observable
    cpu: number[] = [];
    @observable
    time: number[] = [];
    @observable
    smart: Map<string, ISmartStatus[]> = new Map;
    @observable
    up: boolean = true;
    @action
    setFromInitialState(s: IStatus) {
        if (!s) return;
        this.uptime = s.uptime;
        this.meminfo = s.meminfo;
        this.lsb_release = s.lsb_release;
        this.uname = s.uname;
        this.loadavg = s.loadavg;
        for (let key in s.mounts)
            this.mounts.set(key, s.mounts[key]);
        for (let key in s.services)
            this.services.set(key, s.services[key]);
        this.diskread = s.diskread;
        this.diskwrite = s.diskwrite;
        this.netread = s.netread;
        this.netwrite = s.netwrite;
        this.cpu = s.cpu;
        this.time = s.time;
        for (let key in s.smart)
            this.smart.set(key, s.smart[key]);
        this.up = s.up;
    }
    @action
    applyStatusUpdate(s: IStatusUpdate) {
        const add = <T>(a: T[], v: T) => {
            while (a.length > 1000)
                a.shift();
            a.push(v);
        };
        this.uptime = s.uptime || this.uptime;
        this.meminfo = s.meminfo || this.meminfo;
        this.lsb_release = s.lsb_release || this.lsb_release;
        this.uname = s.uname || this.uname;
        this.loadavg = s.loadavg || this.loadavg;
        add(this.diskread, s.diskread);
        add(this.diskwrite, s.diskwrite);
        add(this.netread, s.netread);
        add(this.netwrite, s.netwrite);
        add(this.cpu, s.cpu);
        add(this.time, s.time);
        this.up = true;
        if (s.smart) {
            this.smart.clear();
            for (let key in s.smart)
                this.smart.set(key, s.smart[key]);
        }
        for (const key in s.mounts) {
            const mount = s.mounts[key];
            if (mount === null)
                this.mounts.delete(key);
            else
                this.mounts.set(key, mount);
        }
        for (const key in s.services) {
            const service = s.services[key];
            if (service === null)
                this.services.delete(key);
            else
                this.services.set(key, service);
        }
    }
};

export default StatusState;
