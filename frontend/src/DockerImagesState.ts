import { action, makeObservable, observable } from "mobx";
import type Remote from "./Remote";
import {
    ACTION,
    type DockerImageTag,
    type IDockerImageTagsCharged,
    type IDockerListImageTagHistoryRes,
    type IDockerListImageTagsRes,
} from "./shared/actions";
import state from "./state";
import getOrInsert from "./shared/getOrInsert";
import nullCheck from "./shared/nullCheck";

export default class DockerImagesState {
    constructor() {
        makeObservable(this);
    }

    @observable
    show_all: boolean = false;

    @observable
    projects: Remote<Map<string, DockerImageTag[]>> = { state: "initial" };

    @observable
    imageHistory = new Map<string, Map<string, Remote<Map<number, DockerImageTag>>>>();

    @observable
    imageTagPin = new Set<string>(); // Key is image + ":" + tag

    load() {
        if (this.projects.state != "initial") return;
        state.sendMessage({
            type: ACTION.DockerListImageTags,
            ref: 0,
        });
        this.projects = { state: "loading" };
    }

    @action
    setPinnedImageTags(pit: Array<{ image: string; tag: string }>) {
        for (const { image, tag } of pit) this.imageTagPin.add(image + ":" + tag);
    }

    @action
    loadImageHistory(project: string, tag: string) {
        let h1 = this.imageHistory.get(project);
        if (!h1) {
            h1 = new Map();
            this.imageHistory.set(project, h1);
        }
        const h2 = h1.get(tag);
        if (h2 && h2.state != "initial") return;
        state.sendMessage({
            type: ACTION.DockerListImageTagHistory,
            ref: 0,
            image: project,
            tag,
        });
        h1.set(tag, { state: "loading" });
    }

    @action
    handleLoad(act: IDockerListImageTagsRes) {
        if (this.projects.state != "data") this.projects = { state: "data", data: new Map() };
        for (const tag of act.tags) {
            getOrInsert(this.projects.data, tag.image, () => []).push(tag);
        }

        const pit = act.pinnedImageTags;
        if (pit != null) nullCheck(state.dockerImages).setPinnedImageTags(pit);
    }

    @action
    handleLoadHistory(act: IDockerListImageTagHistoryRes) {
        const h1 = this.imageHistory.get(act.image);
        if (!h1) return;
        const m = new Map<number, DockerImageTag>();
        for (const i of act.images) m.set(i.id, i);
        h1.set(act.tag, { state: "data", data: m });
    }

    @action
    handleChange(act: IDockerImageTagsCharged) {
        if (this.projects.state == "data") {
            const projects = this.projects.data;
            for (const tag of act.changed) {
                const lst = getOrInsert(projects, tag.image, () => []);
                let found = false;
                for (let i = 0; i < lst.length; ++i) {
                    if (lst[i].tag != tag.tag) continue;
                    lst[i] = tag;
                    found = true;
                }
                if (!found) lst.push(tag);
            }
            for (const tag of act.removed) {
                const lst = projects.get(tag.image);
                if (lst === undefined) continue;
                projects.set(
                    tag.image,
                    lst.filter((e) => {
                        return e.hash != tag.hash;
                    }),
                );
            }
        }
        for (const tag of act.changed) {
            const h1 = this.imageHistory.get(tag.image);
            if (!h1) continue;
            const h2 = h1.get(tag.tag);
            if (!h2 || h2.state != "data") continue;
            h2.data.set(tag.id, tag);
        }
        const c = act.imageTagPinChanged;
        if (c) {
            for (const { image, tag, pin } of c) {
                if (pin) this.imageTagPin.add(image + ":" + tag);
                else this.imageTagPin.delete(image + ":" + tag);
            }
        }
    }
}
