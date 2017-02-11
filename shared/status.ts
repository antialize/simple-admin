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

export interface IStatus {
    uptime: IStatusUptime;
    meminfo: IStatusMeminfo;
    lsb_release: IStatusLBSRelease;
    uname: IStatusUname;
    loadavg: IStatusLoadAVG;
    mounts: IStatusMount[];
}

interface ObjectMap<T> {
    [K: string]: T;
}

export type IStatuses = ObjectMap<IStatus>;
