import {action, makeObservable, observable} from "mobx";
import type Remote from "./Remote";
import {ACTION, type IModifiedFilesChanged, type ModifiedFile} from "./shared/actions";
import state from "./state";
import nullCheck from "./shared/nullCheck";
import {PAGE_TYPE} from "./shared/state";

export default class ModifiedFilesState {
    constructor() {
        makeObservable(this);
    }

    @observable
    modifiedFiles: Remote<Map<number, ModifiedFile>> = {state: "initial"};

    @observable
    scanning: boolean = false;

    @observable
    lastScanTime: number | null = null;

    @observable
    saveTime: number | null = null;

    private saveInterval: any = null;

    load() {
        if (this.modifiedFiles.state != "initial") return;
        state.sendMessage({
            type: ACTION.ModifiedFilesList,
        });
        this.modifiedFiles = {state: "loading"};
    }

    @action
    handleChange(act: IModifiedFilesChanged) {
        if (act.full) this.modifiedFiles = {state: "data", data: new Map()};
        if (this.modifiedFiles.state != "data") return;
        this.scanning = act.scanning;
        this.lastScanTime = act.lastScanTime;
        for (const id of act.removed) this.modifiedFiles.data.delete(id);
        for (const f of act.changed) this.modifiedFiles.data.set(f.id, f);
    }

    scan() {
        state.sendMessage({
            type: ACTION.ModifiedFilesScan,
        });
    }

    revert(id: number) {
        if (!confirm("Are you sure you want to revert the file on the remote host?")) return;
        state.sendMessage({
            type: ACTION.ModifiedFilesResolve,
            id,
            action: "redeploy",
            newCurrent: null,
        });
        nullCheck(state.page).set({type: PAGE_TYPE.ModifiedFiles});
    }

    save(id: number, newCurrent: string) {
        if (!newCurrent) return;
        if (this.modifiedFiles.state != "data") return;
        const f = this.modifiedFiles.data.get(id);
        if (!f) return;
        if (!confirm("Are you sure you want save the current object?")) return;
        state.sendMessage({
            type: ACTION.ModifiedFilesResolve,
            id,
            action: "updateCurrent",
            newCurrent,
        });

        this.saveTime = 10;

        this.saveInterval = setInterval(() => {
            if (this.saveTime === null) return;
            --this.saveTime;
            if (this.saveTime > 0) return;
            clearInterval(this.saveInterval);
            nullCheck(state.page).set({type: PAGE_TYPE.Object, objectType: f.type, id: f.object});
            this.saveTime = null;
            this.saveInterval = null;
        }, 500);
    }
}
