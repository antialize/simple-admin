import { config } from "./config";
import { db } from "./instances";

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

export const noAccess: AuthInfo = {
    auth: false,
    user: null,
    pwd: false,
    otp: false,
    admin: false,
    dockerPull: false,
    dockerPush: false,
    dockerDeploy: false,
    session: null,
    sslname: null,
    authDays: null,
};

export async function getAuth(host: string | null, sid: string | null): Promise<AuthInfo> {
    if (sid === null) return noAccess;
    let user: string | null = null;
    let pwd = false;
    let otp = false;
    let specialSession = false;
    if (!sid.includes(":")) {
        let row = null;
        try {
            row = await db.get(
                "SELECT `pwd`, `otp`, `user`, `host` FROM `sessions` WHERE `sid`=?",
                sid,
            );
            if (!row) return noAccess;
            if (host !== null && row.host !== host) return noAccess;
            user = row.user;
            const pwdExpiration = user === "docker_client" ? 60 * 60 : 12 * 60 * 60; //Passwords time out after 24 hours
            const otpExpiration = user === "docker_client" ? 60 * 60 : 64 * 24 * 60 * 60; //otp time out after 2 months
            const now = (Date.now() / 1000) | 0;
            pwd = row.pwd != null && row.pwd + pwdExpiration > now;
            otp = row.otp != null && row.otp + otpExpiration > now;
        } catch (e) {
            console.error("Query failed", e);
            return noAccess;
        }
    } else {
        user = sid.split(":")[0];
        specialSession = true;
    }
    if (!user) return noAccess;
    let found = false;
    let admin = false;
    let dockerPull = false;
    let dockerPush = false;
    let dockerDeploy = false;
    let sslname = null;
    let authDays = null;
    if (!found && !specialSession && user === "docker_client") {
        found = true;
        dockerPull = true;
        dockerPush = true;
    }
    if (!found && !specialSession && config.users) {
        for (const u of config.users) {
            if (u.name === user) {
                found = true;
                admin = true;
                dockerPull = true;
                dockerPush = true;
                dockerDeploy = true;
            }
        }
    }
    if (!found) {
        try {
            const contentStr = await db.getUserContent(user);
            if (!contentStr) return noAccess;
            const content = JSON.parse(contentStr);
            found = true;
            if (specialSession) {
                const sessions = content.sessions;
                if (sessions?.split(",").includes(sid)) {
                    dockerPull = content.dockerPull;
                    dockerPush = content.dockerPush;
                    otp = true;
                    pwd = true;
                } else {
                    return noAccess;
                }
            } else {
                admin = content.admin;
                dockerPull = content.dockerPull;
                dockerPush = content.dockerPush;
                dockerDeploy = content.dockerDeploy;
                sslname = content.sslname;
                authDays = content.authDays != null ? parseInt(content.authDays) : null;
            }
        } catch (e) {
            console.error("Query failed", e);
            return noAccess;
        }
    }
    return {
        auth: pwd && otp,
        user,
        pwd,
        otp,
        admin: admin && pwd && otp,
        dockerPull: pwd && otp && (admin || dockerDeploy || dockerPull),
        dockerPush: pwd && otp && (admin || dockerDeploy || dockerPush),
        dockerDeploy: pwd && otp && (admin || dockerDeploy),
        sslname: pwd && otp ? sslname : null,
        session: sid,
        authDays,
    };
}
