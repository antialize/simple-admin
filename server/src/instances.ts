import type { DB } from "./db";
import type { Deployment } from "./deployment";
import type { HostClients } from "./hostclient";
import type { ModifiedFiles } from "./modifiedfiles";
import type { Msg } from "./msg";
import type { WebClients } from "./webclient";

export let webClients: WebClients;
export let hostClients: HostClients;
export let deployment: Deployment;
export let msg: Msg;
export let db: DB;
export let modifiedFiles: ModifiedFiles;
export let rs: any;
export function setWebClients(_: WebClients) {
    webClients = _;
}
export function setHostClients(_: HostClients) {
    hostClients = _;
}
export function setDeployment(_: Deployment) {
    deployment = _;
}
export function setMsg(_: Msg) {
    msg = _;
}
export function setDb(_: DB) {
    db = _;
}
export function setModifiedFiles(_: ModifiedFiles) {
    modifiedFiles = _;
}
export function setRs(_: any) {
    rs = _;
}
