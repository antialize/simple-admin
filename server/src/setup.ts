import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { config } from "./config";
import { db } from "./instances";
import { webClients } from "./instances";
import { ACTION, type IObjectChanged } from "./shared/actions";
import type { IObject2 } from "./shared/state";
const serverRs = require("simple_admin_server_rs");

export default async (req: Request, res: Response) => {
    res.type("text/x-shellscript");
    const host = req.param("host");
    const token = req.param("token");
    if (!host) {
        res.status(405).send('#!/bin/bash\necho "Missing hostname"\n');
        return;
    }
    const ho = await db.getHostContentByName(host);
    if (!ho || !ho.content || (ho.content as any).password !== token) {
        res.status(406).send('#!/bin/bash\necho "Invalid"\n');
        return;
    }

    const npw = randomBytes(18).toString("base64");
    const cpw = serverRs.cryptHash(npw);
    const obj: IObject2<any> = {
        id: ho.id,
        type: ho.type,
        name: ho.name,
        category: ho.category,
        comment: ho.comment,
        content: { ...ho.content, password: cpw },
        version: ho.version,
        time: ho.time,
        author: ho.author,
    };

    const { id, version } = await db.changeObject(obj.id, obj, "setup");
    obj.version = version;
    obj.id = id;
    const act: IObjectChanged = { type: ACTION.ObjectChanged, id: ho.id, object: [obj] };
    webClients.broadcast(act);

    let script = "#!/bin/bash\n";
    script += "set -e\n";
    script += "if which apt; then\n";
    script += "  apt install -y wget unzip\n";
    script += "fi\n";
    script += `echo \'{"server_host": "${config.hostname}", "hostname": "${host}\"}' > /etc/sadmin.json\n`;
    script += `echo \'{"password": "${npw}\"}' > /etc/sadmin_client_auth.json\n`;
    script += "chmod 0600 /etc/sadmin_client_auth.json\n";
    script +=
        "wget https://github.com/antialize/simple-admin/releases/download/v0.0.15/sadmin-client.zip -O /tmp/sadmin-client.zip\n";
    script += "cd /usr/local/bin\n";
    script += "unzip -o /tmp/sadmin-client.zip\n";
    script += "/usr/local/bin/sadmin upgrade\n";
    script += "systemctl daemon-reload\n";
    script += "systemctl enable simpleadmin-client.service\n";
    script += "systemctl restart simpleadmin-client.service\n";
    script += "systemctl status simpleadmin-client.service\n";
    script += "echo 'Done'\n";
    res.send(script);
};
