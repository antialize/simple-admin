import type { WebClients } from "./webclient";

export let webClients: WebClients;
export let rs: any;
export function setWebClients(_: WebClients) {
    webClients = _;
}
export function setRs(_: any) {
    rs = _;
}
