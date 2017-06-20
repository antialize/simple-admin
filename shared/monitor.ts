export enum MonitorPropType {
    none, string, aOfB, number, uptime, distribution, sumAndCount
}

export enum MonitorUnit {
    bytes, count, seconds, area, fraction
}

export interface IStringMonitorProp {
    type: MonitorPropType.string;
    identifier: string;
    collection:boolean;
}

export interface IAOfBMonitorProp {
    type: MonitorPropType.aOfB;
    identifier: string;
    unit: MonitorUnit;
    collection:boolean;
}

export interface INumberMonitorProp {
    type: MonitorPropType.number;
    identifier: string;
    unit: MonitorUnit;
    collection:boolean;
}

export interface IUptimeMonitorProp {
    type: MonitorPropType.uptime;
    identifier: string;
    collection:boolean;
}

export interface IDistributionMonitorProp {
    type: MonitorPropType.distribution;
    identifier: string;
    unit: MonitorUnit;
    collection:boolean;
}
export interface ISumAndCountMonitorProp {
    type: MonitorPropType.sumAndCount;
    identifier: string;
    unit: MonitorUnit;
    collection:boolean;
}

export interface INoneMonitorProp {
    type: MonitorPropType.none;
}

export type IMonitorProp = IStringMonitorProp | IAOfBMonitorProp | INumberMonitorProp | IUptimeMonitorProp | IDistributionMonitorProp | ISumAndCountMonitorProp | INoneMonitorProp;

export interface IMonitor {
    content?: IMonitorProp[];
}