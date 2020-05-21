import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { db } from "./instances";
import { ISshSign } from "../../shared/actions";
import { certificateAuthorityId } from "../../shared/type";
import { WebClient } from "./webclient";

interface SshKey {
    publicPart: string;
    privatePart: string;
}

function runChildProcess(cmd: string, args: string[], timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.execFile(cmd, args, {timeout}, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            resolve(stdout + stderr);
        });
    });
}

export class Ssh {
    async sign(client: WebClient, act: ISshSign) {
        if (!client.auth.user) {
            this.connection.close(403);
            return;
        }
        const objectRow = await db.get('SELECT `id`, `content` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1', certificateAuthorityId, act.certificateAuthorityName);
        if (!objectRow) {
            const res: ISshSignRes = { type: ACTION.SshSignRes, error: "Did not find certificate authority by name" };
            client.sendMessage(res);
            return;
        }
        const key = this.getAuthorityKey(objectRow.content, objectRow.id);
        if (!key) {
            const res: ISshSignRes = { type: ACTION.SshSignRes, error: "Did not find certificate key" };
            client.sendMessage(res);
            return;
        }
    }

    async getAuthorityKey(caContent: any, id: number): SshKey {
        const rows = await db.all("SELECT `private_part`, `public_part` FROM `ssh_private_key` WHERE `id` = ?", id);
        if (rows.length === 0) {
            return null;
        return { privatePart: rows[0]["private_part"], publicPart: rows[0]["public_part"] };
    }

    async ensureAuthorityKey(caContent: any, id: number) {
        const rows = await db.all("SELECT `private_part`, `public_part` FROM `ssh_private_key` WHERE `id` = ?", id);
        if (rows.length > 0) return;
        const { privatePart, publicPart } = await this.generateAuthorityKey();
        await db.run("REPLACE INTO `ssh_private_key` (`id`, `private_part`, `public_part`) VALUES (?, ?, ?)", id, privatePart, publicPart);
    }

    async generateAuthorityKey(): SshKey {
        const d = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ca-"));
        const privatePath = path.join(d, "ca");
        const publicPath = path.join(d, "ca.pub");
        const timeout = 5;
        const commandOutput = await runChildProcess("ssh-keygen", ["-f", privatePath], timeout);
        const sshKey = fs.promises.readFile(privatePath).then(privatePart =>
            fs.promises.readFile(publicPath).then(publicPart =>
                ({privatePart, publicPart}))
        ).catch(e => {
            throw new Error("ssh-keygen did not produce a key-pair. Command output: " + commandOutput);
        });
        await fs.promises.unlink(privatePath);
        await fs.promises.unlink(publicPart);
        await fs.promises.rmdir(d);
        return sshKey;
    }

    async signInner(caKey: SshKey, userKey: string): SshKey {
        // < ca ssh-keygen -s /dev/stdin -I the_certificate_identity -n the_certificate_principal -V +20h -z 42 user.pub
        const d = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sign-"));
        const privatePath = path.join(d, "ca");
        const publicPath = path.join(d, "user.pub");
        await fs.promises.writeFile(privatePath, caKey.privatePart);
        await fs.promises.writeFile(publicPath, userKey);
        const timeout = 5;
        const commandOutput = await runChildProcess("ssh-keygen", ["-f", privatePath], timeout);
        const sshKey = fs.promises.readFile(privatePath).then(privatePart =>
            fs.promises.readFile(publicPath).then(publicPart =>
                ({privatePart, publicPart}))
        ).catch(e => {
            throw new Error("ssh-keygen did not produce a key-pair. Command output: " + commandOutput);
        });
        await fs.promises.unlink(privatePath);
        await fs.promises.unlink(publicPart);
        await fs.promises.rmdir(d);
        return sshKey;
    }
}
