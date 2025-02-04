export interface IContains {
    contains: number[];
}

export interface IDepends {
    depends: number[];
}

export interface ISudoOn {
    sudoOn: number[];
}

export interface ITrigger {
    id: number;
    values: Record<string, any>;
}

export interface ITriggers {
    triggers: ITrigger[];
}
