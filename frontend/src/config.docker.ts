declare global {
	interface Window { SADMIN_DOMAIN: string | undefined; }
}
if (!window.SADMIN_DOMAIN) throw new Error("No SADMIN_DOMAIN configured");
export let remoteHost: string = window.SADMIN_DOMAIN;
