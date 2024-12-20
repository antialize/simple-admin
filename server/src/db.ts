import type { IObject2 } from "./shared/state";
import {
    type Host,
    type IContains,
    type IDepends,
    type IVariables,
    hostId,
    rootId,
    rootInstanceId,
} from "./shared/type";

import { collectionId, complexCollectionId, hostVariableId } from "./default";

import Mustache = require("mustache");
import { rs } from "./instances";
const serverRs = require("simple_admin_server_rs");

export async function getHostContentByName(hostname: string): Promise<{
    id: number;
    content: Host;
    version: number;
    type: number;
    name: string;
    category: string;
    comment: string;
    time: number;
    author: string | null;
} | null> {
    const row = await serverRs.getObjectByNameAndType(rs, hostname, hostId);
    if (row === null) return null;
    return {
        id: row.id,
        content: JSON.parse(row.content),
        version: row.version,
        type: hostId,
        name: hostname,
        category: row.category,
        comment: row.comment,
        time: +row.time,
        author: row.author,
    };
}

export async function getRootVariables() {
    const rootRow = await serverRs.getObjectContentByIdAndType(rs, rootInstanceId, rootId);
    const variables: { [key: string]: string } = {};
    const rootVars = JSON.parse(rootRow.content) as IVariables;
    if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
    if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
    return variables;
}

export async function getHostVariables(
    id: number,
): Promise<null | [Host, { [key: string]: string }]> {
    const hostRow = await serverRs.getObjectContentByIdAndType(rs, id, hostId);
    const rootRow = await serverRs.getObjectContentByIdAndType(rs, rootInstanceId, rootId);
    if (!hostRow || !rootRow) return null;
    const hostInfo = JSON.parse(hostRow.content) as Host;
    const variables: { [key: string]: string } = {};

    const rootVars = JSON.parse(rootRow.content) as IVariables;
    if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
    if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
    variables.nodename = hostRow.name;

    const visited = new Set();

    const visitObject = async (id: number) => {
        if (visited.has(id)) return;
        visited.add(id);

        const objectRow = await serverRs.getNewestObjectByID(rs, id);
        if (!objectRow) return;
        switch (objectRow.type) {
            case collectionId:
            case complexCollectionId: {
                const o = JSON.parse(objectRow.content) as IContains & IDepends;
                if (o.contains) for (const id of o.contains) await visitObject(id);
                if (o.depends) for (const id of o.depends) await visitObject(id);
                break;
            }
            case hostVariableId: {
                const vs = JSON.parse(objectRow.content) as IVariables;
                if (vs.variables)
                    for (const v of vs.variables)
                        variables[v.key] = Mustache.render(v.value, variables);
                if (vs.secrets)
                    for (const v of vs.secrets)
                        variables[v.key] = Mustache.render(v.value, variables);
                break;
            }
        }
    };

    for (const id of hostInfo.contains) await visitObject(id);

    if (hostInfo.variables) for (const v of hostInfo.variables) variables[v.key] = v.value;
    if (hostInfo.secrets) for (const v of hostInfo.secrets) variables[v.key] = v.value;

    return [hostInfo, variables];
}
