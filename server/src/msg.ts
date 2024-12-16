import { db, webClients } from "./instances";
import * as actions from "./shared/actions";

export class Msg {
    async emit(
        host: number,
        type: string,
        message: string,
        subtype: string | null = null,
        url: string | null = null,
    ) {
        const time = +new Date() / 1000;
        const id = await db.insert(
            "INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, 0)",
            host,
            type,
            subtype,
            message,
            url,
            time,
        );
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
                dismissed: false,
            },
        };
        webClients.broadcast(act);
    }

    async setDismissed(ids: number[], dismissed: boolean) {
        const time = dismissed ? +new Date() / 1000 : null;

        await db.run(
            `UPDATE \`messages\` SET \`dismissed\`=?, \`dismissedTime\`=? WHERE \`id\` IN (${ids.join(",")})`,
            dismissed,
            time,
        );

        const act: actions.ISetMessagesDismissed = {
            type: actions.ACTION.SetMessagesDismissed,
            ids: ids,
            dismissed: dismissed,
            source: "server",
        };

        webClients.broadcast(act);
    }
}
