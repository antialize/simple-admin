export interface RunScript {
    type: 'run_script';
    id: number;
    name: string;
    interperter: string;
    content: string;
    args: string[];
    stdin_type?: 'none' | 'string' | 'blocked_json';
    stdout_type?: 'none' | 'string' | 'blocked_json';
    stderr_type?: 'none' | 'string' | 'blocked_json';
}

export interface Data {
    type: 'data';
    id: number;
    source?: 'stdout' | 'stderr';
    data: any;
}

export interface Success {
    type: 'success';
    id: number;
}

export interface Failure {
    type: 'failure';
    id: number;
}

export type Outgoing = RunScript;
export type Incomming = Data | Success | Failure;
