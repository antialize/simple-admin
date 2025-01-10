import type { HostClients } from "./hostclient";
import type { WebClients } from "./webclient";

export let webClients: WebClients;
export let hostClients: HostClients;
export let rs: any;
export function setWebClients(_: WebClients) {
    webClients = _;
}
export function setHostClients(_: HostClients) {
    hostClients = _;
}
export function setRs(_: any) {
    rs = _;
}
