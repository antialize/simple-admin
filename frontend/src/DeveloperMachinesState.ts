import { action, makeObservable, observable } from "mobx";
import type { IVantaMachine } from "./shared_types";
import state from "./state";

export default class DeveloperMachinesState {
    constructor() {
        makeObservable(this);
    }

    @observable
    machines: IVantaMachine[] | null = null;

    @observable
    loading = false;

    @observable
    error: string | null = null;

    load() {
        if (this.loading) return;
        this.loading = true;
        this.error = null;
        state.sendMessage({ type: "VantaListMachines" });
    }

    @action
    setMachines(machines: IVantaMachine[]) {
        this.machines = machines;
        this.loading = false;
    }

    @action
    setError(msg: string) {
        this.error = msg;
        this.loading = false;
    }

    removeMachine(hostUuid: string) {
        const msgId = Date.now() % 2 ** 31;
        state.sendMessage({ type: "VantaRemoveMachine", msg_id: msgId, host_uuid: hostUuid });
        // Optimistically remove from local list
        if (this.machines) {
            this.machines = this.machines.filter((m) => m.host_uuid !== hostUuid);
        }
    }
}
