import * as webclient from './webclient'
import { db, webClients } from './instances'
import * as actions from '../../shared/actions'
import { errorHandler, ErrorType, SAError } from './error'

export class Msg {
    async emit(host: number, type: string, message: string, subtype: string = null, url: string = null) {
        const time = +new Date() / 1000;
        const id = await db.insert("INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, 0)", host, type, subtype, message, url, time)
        if (!message) message = "";
        const act: actions.IAddMessage = {
            type: actions.ACTION.AddMessage,
            message: {
                id,
                host,
                type,
                message: message.substr(0, 1000),
                fullMessage: message.length < 1000,
                subtype,
                time,
                url,
                dismissed: false
            }
        };
        webClients.broadcast(act);
    }

    setDismissed(ids: number[], dismissed: boolean) {
        const time = dismissed ? (+new Date() / 1000) : null;

        db.db.run("UPDATE `messages` SET `dismissed`=?, `dismissedTime`=? WHERE `id` IN (" + ids.join(",") + ")", [dismissed, time], (err) => {
            if (err == null) return;
            errorHandler("Msg::setDismissed", false)(new SAError(ErrorType.Database, err));
        });
        const act: actions.ISetMessagesDismissed = {
            type: actions.ACTION.SetMessagesDismissed,
            ids: ids,
            dismissed: dismissed,
            source: "server"
        };

        webClients.broadcast(act);
    }

    async getResent() {
        const time = (+new Date() / 1000) - 60 * 60 * 24 * 2; //Two dayes ago
        const res: actions.IMessage[] = [];
        for (const row of await db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed`, `dismissedTime` FROM `messages` WHERE `dismissed`=0 OR `dismissedTime`>?", time)) {
            const msg: string = row['message'] || "";
            if (row.type === null) continue;
            res.push({
                id: row['id'],
                host: row['host'],
                type: row['type'],
                subtype: row['subtype'],
                message: msg.substr(0, 1000),
                fullMessage: msg.length < 1000,
                url: row['url'],
                time: row['time'],
                dismissed: row['dismissed'] == 1
            });
        }
        return res;
    }

    getFullText(id: number) {
        return db.get("SELECT `message` FROM `messages` WHERE `id`=?", [id]) as Promise<{ message: string }>;
    }

    async getAll() {
        const res: actions.IMessage[] = [];
        for (const row of await db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed`, `dismissedTime` FROM `messages`")) {
            res.push({
                id: row['id'],
                host: row['host'],
                type: row['type'],
                subtype: row['subtype'],
                message: (row['message'] as string).substr(0, 1000),
                fullMessage: (row['message'] as string).length < 1000,
                url: row['url'],
                time: row['time'],
                dismissed: row['dismissed'] == 1
            });
        }
        return res;
    }
}

