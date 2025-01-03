import { rs, webClients } from "./instances";
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
}
