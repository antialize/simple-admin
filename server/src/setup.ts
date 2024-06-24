import { Request, Response } from "express";
import { db } from "./instances";
import { randomBytes } from "crypto";
import { config } from "./config";
import * as crypt from "./crypt";
import { IObject2 } from "./shared/state";
import { ACTION, IObjectChanged } from "./shared/actions";
import { webClients } from "./instances";

export default async (req: Request, res: Response) => {
    res.type("text/x-shellscript");
    let host = req.param("host");
    let token = req.param("token");
    if (!host) {
        res.status(405).send('#!/bin/bash\necho "Missing hostname"\n');
        return;
    }
    let ho = await db.getHostContentByName(host);
    if (!ho || !ho.content || (ho.content as any).password !== token) {
        res.status(406).send('#!/bin/bash\necho "Invalid"\n');
        return;
    }

    let npw = randomBytes(18).toString("base64");
    let cpw = await crypt.hash(npw);
    let obj: IObject2<any> = {
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

    let { id, version } = await db.changeObject(obj.id, obj, "setup");
    obj.version = version;
    obj.id = id;
    let act: IObjectChanged = { type: ACTION.ObjectChanged, id: ho.id, object: [obj] };
    webClients.broadcast(act);

    let script = "#!/bin/bash\n";
    script += "set -e\n";
    script += "apt install -y wget unzip\n";
    script +=
        'echo \'{"server_host": "' +
        config.hostname +
        '", "hostname": "' +
        host +
        "\"}' > /etc/sadmin.json\n";
    script += 'echo \'{"password": "' + npw + "\"}' > /etc/sadmin_client_auth.json\n";
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
