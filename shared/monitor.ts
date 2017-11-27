export enum MonitorPropType {
    none, string, aOfB, number, up, distribution, sumAndCount, sum
}

export enum MonitorUnit {
    bytes, count, seconds, area, fraction
}

export interface IStringMonitorProp {
    type: MonitorPropType.string;
    identifier: string;
}

export interface IAOfBMonitorProp {
    type: MonitorPropType.aOfB;
    identifier: string;
    unit: MonitorUnit;
}

export interface INumberMonitorProp {
    type: MonitorPropType.number;
    identifier: string;
    unit: MonitorUnit;
}

export interface IUpMonitorProp {
    type: MonitorPropType.up;
    identifier: string;
}

export interface IDistributionMonitorProp {
    type: MonitorPropType.distribution;
    identifier: string;
    unit: MonitorUnit;
}
export interface ISumAndCountMonitorProp {
    type: MonitorPropType.sumAndCount;
    identifier: string;
    unit: MonitorUnit;
}

export interface INoneMonitorProp {
    type: MonitorPropType.none;
}

export type IMonitorProp = IStringMonitorProp | IAOfBMonitorProp | INumberMonitorProp | IUpMonitorProp | IDistributionMonitorProp | ISumAndCountMonitorProp | INoneMonitorProp;

export interface IMonitor {
    content?: IMonitorProp[];
}