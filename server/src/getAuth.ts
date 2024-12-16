export interface AuthInfo {
    auth: boolean;
    user: string | null;
    pwd: boolean;
    otp: boolean;
    admin: boolean;
    dockerPull: boolean;
    dockerPush: boolean;
    dockerDeploy: boolean;
    session: string | null;
    sslname: string | null;
    authDays: number | null;
}