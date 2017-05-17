export interface RunScript {
    type: 'run_script';
    id: number;
    name: string;
    interperter: string;
    content: string;
    args: string[];
    stdin_type?: 'none' | 'binary' | 'string' | 'blocked_json';
    stdout_type?: 'none' | 'binary' | 'text' | 'blocked_json';
    stderr_type?: 'none' | 'binary' | 'text' | 'blocked_json';
}

export interface RunInstant {
    type: 'run_instant';
    id: number;
    name: string;
    interperter: string;
    content: string;
    args: string[];
}

export interface Kill {
    type: 'kill';
    id: number;
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

export interface Auth {
    type: 'auth';
    hostname: string;
    password: string;
}

export interface Ping {
    type: 'ping';
    id: number;
}

export interface Pong {
    type: 'pong';
    id: number;
}

export type Outgoing = RunScript | Data | Kill | Ping | RunInstant;
export type Incomming = Data | Success | Failure | Auth | Pong;
