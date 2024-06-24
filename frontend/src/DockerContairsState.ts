import { ObservableMap, action, makeObservable, observable } from "mobx";
import type Remote from "./Remote";
import {
    ACTION,
    type DockerDeployment,
    type IDockerDeploymentsChanged,
    type IDockerListDeploymentHistoryRes,
    type IDockerListDeploymentsRes,
} from "./shared/actions";
import getOrInsert from "./shared/getOrInsert";
import state from "./state";

export default class DockerContainersState {
    constructor() {
        makeObservable(this);
    }

    @observable
    hosts: Remote<ObservableMap<number, DockerDeployment[]>> = { state: "initial" };

    @observable
    containerHistory = new ObservableMap<
        number,
        ObservableMap<string, Remote<ObservableMap<number, DockerDeployment>>>
    >();

    @action
    load() {
        if (this.hosts.state !== "initial") return;
        state.sendMessage({
            type: ACTION.DockerListDeployments,
            ref: 0,
        });
        this.hosts = { state: "loading" };
    }

    @action
    loadHistory(host: number, container: string) {
        let c1 = this.containerHistory.get(host);
        if (!c1) {
            c1 = new ObservableMap();
            this.containerHistory.set(host, c1);
        }
        const c2 = c1.get(container);
        if (c2 && c2.state !== "initial") return;
        state.sendMessage({
            type: ACTION.DockerListDeploymentHistory,
            host,
            name: container,
            ref: 0,
        });
        c1.set(container, { state: "loading" });
    }

    @action
    handleLoad(act: IDockerListDeploymentsRes) {
        if (this.hosts.state !== "data") this.hosts = { state: "data", data: new ObservableMap() };

        for (const tag of act.deployments) {
            getOrInsert(this.hosts.data, tag.host, () => []).push(tag);
        }
    }

    @action
    handleLoadHistory(act: IDockerListDeploymentHistoryRes) {
        const h = this.containerHistory.get(+act.host);
        if (!h) return;
        const m = new ObservableMap();
        for (const d of act.deployments) m.set(d.id, d);
        h.set(act.name, { state: "data", data: m });
    }

    @action
    handleChange(act: IDockerDeploymentsChanged) {
        if (this.hosts.state === "data") {
            const hosts = this.hosts.data;
            for (const tag of act.changed) {
                let found = false;
                const lst = getOrInsert(hosts, tag.host, () => []);
                for (let i = 0; i < lst.length; ++i) {
                    if (lst[i].name !== tag.name) continue;
                    found = true;
                    if (lst[i].id <= tag.id) lst[i] = tag;
                }
                if (!found) lst.push(tag);
            }
            for (const tag of act.removed) {
                const lst = hosts.get(tag.host);
                if (!lst) continue;
                hosts.set(
                    tag.host,
                    lst.filter((e) => e.name !== tag.name),
                );
            }
        }

        for (const tag of act.changed) {
            const h = this.containerHistory.get(tag.host);
            if (!h) continue;
            const hh = h.get(tag.name);
            if (!hh || hh.state !== "data") continue;
            hh.data.set(tag.id, tag);
        }
    }
}
