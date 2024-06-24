import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

function temp_name(): string {
    return `/tmp/${crypto.randomBytes(48).toString("hex")}`;
}

export function strip(crt: string): string {
    let ans = "";
    for (const line of crt.split("\n")) {
        if (!line.startsWith("-----") || !line.endsWith("-----")) ans += line;
    }
    return ans;
}

export function generate_key(): Promise<string> {
    return new Promise<string>((res, rej) => {
        const p = spawn(
            "openssl",
            ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "-"],
            { stdio: ["ignore", "pipe", "inherit"] },
        );
        if (p.stdout === null) throw Error("should not be null");
        let key = "";
        p.stdout.on("data", (data) => {
            key += data;
        });
        p.on("close", (code) => {
            if (code === 0 && key) res(key);
            else rej("Failed");
        });
    });
}

export function generate_ca_crt(key: string): Promise<string> {
    return new Promise<string>((res, rej) => {
        const t1 = temp_name();
        fs.writeFileSync(
            t1,
            "[req]\nprompt = no\ndistinguished_name = distinguished_name\n[distinguished_name]\nC=US\n",
            { mode: 0o600 },
        );
        const p = spawn(
            "openssl",
            [
                "req",
                "-x509",
                "-new",
                "-nodes",
                "-key",
                "-",
                "-sha256",
                "-days",
                "9999",
                "-out",
                "-",
                "-config",
                t1,
            ],
            { stdio: ["pipe", "pipe", "inherit"] },
        );
        if (p.stdin === null) throw Error("should not be null");
        p.stdin.write(key, () => p.stdin?.end());
        if (p.stdout === null) throw Error("should not be null");
        let crt = "";
        p.stdout.on("data", (data) => {
            crt += data;
        });
        p.on("close", (code) => {
            fs.unlink(t1, () => {});
            if (code === 0 && crt) res(crt);
            else rej("Failed");
        });
    });
}

export function generate_srs(key: string, cn: string): Promise<string> {
    return new Promise<string>((res, rej) => {
        const t1 = temp_name();
        fs.writeFileSync(
            t1,
            `[req]\nprompt = no\ndistinguished_name = distinguished_name\n[distinguished_name]\nCN=${cn}\n`,
            { mode: 0o400 },
        );
        const t2 = temp_name();
        fs.writeFileSync(t2, key, { mode: 0o400 });
        const p = spawn("openssl", ["req", "-new", "-key", t2, "-out", "-", "-config", t1], {
            stdio: ["pipe", "pipe", "inherit"],
        });
        if (p.stdout === null) throw Error("should not be null");
        let srs = "";
        p.stdout.on("data", (data) => {
            srs += data;
        });
        p.on("close", (code) => {
            fs.unlink(t1, () => {});
            if (code === 0 && srs) res(srs);
            else rej("Failed");
        });
    });
}

export function generate_crt(
    ca_key: string,
    ca_crt: string,
    srs: string,
    subcerts: string[] = [],
    timeoutDays = 999,
): Promise<string> {
    return new Promise<string>((res, rej) => {
        const t1 = temp_name();
        const t2 = temp_name();
        const t4 = temp_name();
        fs.writeFileSync(t1, srs, { mode: 0o400 });
        fs.writeFileSync(t2, ca_crt, { mode: 0o400 });
        fs.writeFileSync(t4, ca_key, { mode: 0o400 });

        const args = [
            "x509",
            "-req",
            "-days",
            `${timeoutDays}`,
            "-in",
            t1,
            "-CA",
            t2,
            "-CAkey",
            t4,
            "-CAcreateserial",
            "-out",
            "-",
        ];
        let t3: string | null = null;
        if (subcerts.length) {
            t3 = temp_name();
            fs.writeFileSync(
                t3,
                `basicConstraints = critical, CA:TRUE\nkeyUsage = critical, keyCertSign, cRLSign, digitalSignature, nonRepudiation, keyEncipherment, keyAgreement\nsubjectKeyIdentifier = hash\nnameConstraints = critical, ${subcerts.map((v) => `permitted;DNS:${v}`).join(", ")}\n`,
                { mode: 0o400 },
            );
            args.push("-extfile");
            args.push(t3);
        }
        const p = spawn("openssl", args, { stdio: ["pipe", "pipe", "inherit"] });

        if (p.stdout === null) throw Error("should not be null");
        let crt = "";
        p.stdout.on("data", (data) => {
            crt += data;
        });
        p.on("close", (code) => {
            fs.unlink(t1, () => {});
            fs.unlink(t2, () => {});
            if (t3) {
                fs.unlink(t3, () => {});
            }
            if (code === 0 && crt) res(crt);
            else rej("Failed");
        });
    });
}

export async function generate_ssh_crt(
    keyId: string,
    principal: string,
    caPrivateKey: string,
    clientPublicKey: string,
    validityDays: number,
    type: "host" | "user",
): Promise<string> {
    const sshHostCaKeyFile = temp_name();
    const tmp = temp_name();
    const clientPublicKeyFile = `${tmp}.pub`;
    const outputCertificateFile = `${tmp}-cert.pub`;
    try {
        fs.writeFileSync(
            sshHostCaKeyFile,
            `-----BEGIN OPENSSH PRIVATE KEY-----\n${caPrivateKey}\n-----END OPENSSH PRIVATE KEY-----\n`,
            { mode: 0o400 },
        );
        fs.writeFileSync(clientPublicKeyFile, clientPublicKey, { mode: 0o400 });
        const args = [
            "-s",
            sshHostCaKeyFile,
            "-I",
            keyId,
            ...(type === "host" ? ["-h"] : []),
            "-n",
            principal,
            "-V",
            `-5m:+${+validityDays}d`,
            "-z",
            "42",
            clientPublicKeyFile,
        ];
        const p = spawn("ssh-keygen", args, { stdio: ["inherit", "inherit", "inherit"] });
        const code: number = await new Promise((r) => p.on("close", r));
        if (code !== 0) throw new Error(`ssh-keygen exited with code ${code}`);
        return fs.readFileSync(outputCertificateFile, { encoding: "utf-8" });
    } finally {
        fs.unlink(sshHostCaKeyFile, () => {});
        fs.unlink(clientPublicKeyFile, () => {});
        fs.unlink(outputCertificateFile, () => {});
    }
}
