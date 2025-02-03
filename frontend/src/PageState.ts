import * as $ from "jquery";
import { action, makeObservable, observable, runInAction } from "mobx";
import type * as React from "react";
import ObjectState from "./ObjectState";
import getOrInsert from "./getOrInsert";
import nullCheck from "./nullCheck";
import { HOST_ID, type IPage, PAGE_TYPE } from "./shared_types";
import state from "./state";

function never(_: never, message: string) {
    console.error(message);
}

class PageState {
    constructor() {
        makeObservable(this);
    }

    @observable
    nextNewObjectId = -2;

    @observable
    private current_: IPage = { type: PAGE_TYPE.Dashbord };

    @action
    loadContent() {
        const p = this.current_;
        switch (p.type) {
            case PAGE_TYPE.Deployment:
            case PAGE_TYPE.Dashbord:
            case PAGE_TYPE.Search:
            case PAGE_TYPE.ObjectList:
            case PAGE_TYPE.DeploymentDetails:
                break;
            case PAGE_TYPE.Object:
                {
                    const id = p.id;
                    if (id) getOrInsert(state.objects, id, () => new ObjectState(id)).loadCurrent();
                    if (p.objectType === HOST_ID) nullCheck(state.dockerContainers).load();
                }
                break;
            case PAGE_TYPE.DockerImages:
                nullCheck(state.dockerImages).load();
                break;
            case PAGE_TYPE.DockerServices:
                nullCheck(state.dockerContainers).load();
                break;
            case PAGE_TYPE.ModifiedFiles:
            case PAGE_TYPE.ModifiedFile:
                nullCheck(state.modifiedFiles).load();
                break;
            case PAGE_TYPE.DockerContainerDetails:
            case PAGE_TYPE.DockerContainerHistory:
                nullCheck(state.dockerContainers).loadHistory(p.host, p.container);
                break;
            case PAGE_TYPE.DockerImageHistory:
                nullCheck(state.dockerImages).loadImageHistory(p.project, p.tag);
                break;
            default:
                never(p, "Unhandled page");
        }
    }

    onClick(e: React.MouseEvent<unknown>, page: IPage) {
        if (e.metaKey || e.ctrlKey || e.button === 2) return;
        e.preventDefault();
        this.set(page);
    }

    get current() {
        return this.current_;
    }

    set current(p: IPage) {
        runInAction(() => {
            this.current_ = p;
            this.loadContent();
        });
    }

    @action
    set(page: IPage) {
        const pg = Object.assign({}, page);
        if (pg.type === PAGE_TYPE.Object && !pg.id) {
            pg.id = this.nextNewObjectId;
            --this.nextNewObjectId;
        }
        history.pushState(pg, "", this.link(pg));
        this.current = pg;
    }

    link(page: IPage): string {
        const o: Record<string, string> = {};
        switch (page.type) {
            case PAGE_TYPE.Deployment:
                o.page = "deployment";
                break;
            case PAGE_TYPE.Dashbord:
                o.page = "dashbord";
                break;
            case PAGE_TYPE.ObjectList:
                o.page = "objectlist";
                o.type = `${page.objectType}`;
                break;
            case PAGE_TYPE.Object:
                o.page = "object";
                o.type = `${page.objectType}`;
                if (page.id != null) o.id = `${page.id}`;
                else o.id = "-1";
                if (page.version != null) o.version = `${page.version}`;
                break;
            case PAGE_TYPE.DeploymentDetails:
                o.page = "deploymentDetails";
                o.index = `${page.index}`;
                break;
            case PAGE_TYPE.DockerImages:
                o.page = "dockerImages";
                break;
            case PAGE_TYPE.DockerServices:
                o.page = "dockerContainers";
                break;
            case PAGE_TYPE.ModifiedFiles:
                o.page = "modifiedFiles";
                break;
            case PAGE_TYPE.ModifiedFile:
                o.page = "modifiedFile";
                o.id = `${page.id}`;
                break;
            case PAGE_TYPE.DockerContainerDetails:
                o.page = "dockerContainerDetails";
                o.host = `${page.host}`;
                o.container = page.container;
                o.id = `${page.id}`;
                break;
            case PAGE_TYPE.DockerContainerHistory:
                o.page = "dockerContainerHistory";
                o.host = `${page.host}`;
                o.container = page.container;
                break;
            case PAGE_TYPE.DockerImageHistory:
                o.page = "dockerImageHistory";
                o.project = `${page.project}`;
                o.tag = page.tag;
                break;
            case PAGE_TYPE.Search:
                o.page = "search";
                break;
            default:
                never(page, "Unhandled page");
        }
        return `?${$.param(o)}`;
    }

    @action
    setFromUrl() {
        const getUrlParameter = (name: string) => {
            const name2 = name.replace(/[[]/, "\\[").replace(/[\]]/, "\\]");
            const regex = new RegExp(`[\\?&]${name2}=([^&#]*)`);
            const results = regex.exec(location.search);
            return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        };

        const p = getUrlParameter("page");
        switch (p) {
            case "dockerImages":
                this.current = { type: PAGE_TYPE.DockerImages };
                break;
            case "dockerContainers":
                this.current = { type: PAGE_TYPE.DockerServices };
                break;
            case "modifiedFiles":
                this.current = { type: PAGE_TYPE.ModifiedFiles };
                break;
            case "modifiedFile":
                this.current = { type: PAGE_TYPE.ModifiedFile, id: +getUrlParameter("id") };
                break;
            case "deployment":
                this.current = { type: PAGE_TYPE.Deployment };
                break;
            case "objectlist":
                this.current = {
                    type: PAGE_TYPE.ObjectList,
                    objectType: +getUrlParameter("type"),
                };
                break;
            case "object":
                {
                    const v = getUrlParameter("version");
                    this.current = {
                        type: PAGE_TYPE.Object,
                        objectType: +getUrlParameter("type"),
                        id: +getUrlParameter("id"),
                        version: v ? +v : undefined,
                    };
                }
                break;
            case "deploymentDetails":
                this.current = {
                    type: PAGE_TYPE.DeploymentDetails,
                    index: +getUrlParameter("index"),
                };
                break;
            case "dockerContainerDetails":
                this.current = {
                    type: PAGE_TYPE.DockerContainerDetails,
                    host: +getUrlParameter("host"),
                    container: getUrlParameter("container"),
                    id: +getUrlParameter("id"),
                };
                break;
            case "dockerContainerHistory":
                this.current = {
                    type: PAGE_TYPE.DockerContainerHistory,
                    host: +getUrlParameter("host"),
                    container: getUrlParameter("container"),
                };
                break;
            case "dockerImageHistory":
                this.current = {
                    type: PAGE_TYPE.DockerImageHistory,
                    project: getUrlParameter("project"),
                    tag: getUrlParameter("tag"),
                };
                break;
            case "search":
                this.current = { type: PAGE_TYPE.Search };
                break;
            default:
                this.current = { type: PAGE_TYPE.Dashbord };
                break;
        }
    }
}

export default PageState;
