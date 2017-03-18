interface IStatusUptime {
    idle: number;
    total: number;
}

interface IStatusMeminfo {
    avail: number;
    total: number;
    free: number;
    swap_total: number;
    swap_free: number;
}

interface IStatusLBSRelease {
    release: string;
    codename: string;
    id: string;
    description: string;
}

interface IStatusUname {
    release: string;
    sysname: string;
    machine: string;
    version: string;
    nodename: string;
}

interface IStatusLoadAVG {
    five_minute: number; 
    active_processes: number; 
    ten_minute: number; 
    minute: number;
    total_processes: number;
}

interface IStatusMount {
    files: number;
    free_files: number;
    avail_files: number;
    blocks: number;
    free_blocks: number;
    avail_blocks: number;
    src: string;
    target: string;
    fstype: string;
}

export interface IService {
    loadedState: string;
    subState: string;
    activeState: string;
    name: string;
    StatusText: string;
}

export interface IStatusUpdate {
    uptime: IStatusUptime;
    meminfo: IStatusMeminfo;
    lsb_release: IStatusLBSRelease | null;
    uname: IStatusUname | null;
    loadavg: IStatusLoadAVG;
    mounts: {[target:string]:IStatusMount|null}
    services: {[name:string]:IService|null}
    diskread: number;
    diskwrite: number;
    netread: number;
    netwrite: number;
    cpu: number;
    time: number;
}

export interface IStatus {
    uptime: IStatusUptime;
    meminfo: IStatusMeminfo;
    lsb_release: IStatusLBSRelease;
    uname: IStatusUname;
    loadavg: IStatusLoadAVG;
    mounts: {[target:string]:IStatusMount}
    services: {[name:string]:IService}
    diskread: number[];
    diskwrite: number[];
    netread: number[];
    netwrite: number[];
    cpu: number[];
    time: number[];
}

export function applyStatusUpdate(status:IStatus| null, update:IStatusUpdate) {
    if (status == null) {
        status = {
            uptime: {total: 0, idle: 0},
            meminfo: {avail: 0, total: 0, free: 0, swap_free: 0, swap_total: 0},
            lsb_release: {release: "", codename: "", id:"", description: ""},
            uname: {release: "", sysname: "", machine: "", version: "", nodename: ""},
            loadavg: {five_minute: 0, active_processes: 0, ten_minute: 0, minute: 0, total_processes: 0},
            mounts: {},
            services: {},
            diskread: [],
            diskwrite: [],
            netread: [],
            netwrite: [],
            cpu: [],
            time: []
        };
    }

    const s = Math.max(status.cpu.length - 1000, 0)
    const res: IStatus = {
        uptime: update.uptime,
        meminfo: update.meminfo,
        lsb_release: update.lsb_release || status.lsb_release,
        uname: update.uname || status.uname,
        loadavg: update.loadavg,
        mounts: Object.assign({}, status.mounts),
        services: Object.assign({}, status.services),
        diskread: status.diskread.slice(s),
        diskwrite: status.diskwrite.slice(s),
        netread: status.netread.slice(s),
        netwrite: status.netwrite.slice(s),
        cpu: status.cpu.slice(s),
        time: status.time.slice(s)
    }

    for (const key in update.mounts) {
        const mount = update.mounts[key];
        if (mount === null)
            delete res.mounts[key];
        else
            res.mounts[key] = mount;
    }

    for (const key in update.services) {
        const service = update.services[key];
        if (service === null)
            delete res.services[key];
        else
            res.services[key] = service;
    }

    res.diskread.push(update.diskread);
    res.diskwrite.push(update.diskwrite);
    res.netread.push(update.netread);
    res.netwrite.push(update.netwrite);
    res.cpu.push(update.cpu);
    res.time.push(update.time);
    return res;
}

export type IStatuses = {[host:number]:IStatus};