import { db, rs, webClients } from "./instances";
import * as actions from "./shared/actions";
const serverRs = require("simple_admin_server_rs");

export class Msg {
    async emit(
        host: number,
        type: string,
        message: string,
        subtype: string | null = null,
        url: string | null = null,
    ) {
        const time = +new Date() / 1000;

        const id = await serverRs.insertMessage(rs, host, type, message, subtype, url, time);
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

        await serverRs.setDismissed(rs, ids, dismissed, time);

        const act: actions.ISetMessagesDismissed = {
            type: actions.ACTION.SetMessagesDismissed,
            ids: ids,
            dismissed: dismissed,
            source: "server",
        };

        webClients.broadcast(act);
    }
}
