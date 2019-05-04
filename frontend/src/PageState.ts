import * as $ from 'jquery'
import * as React from "react";
import * as State from '../../shared/state'
import ObjectState from "./ObjectState";
import state from "./state";
import { action, observable } from "mobx";

function never(n:never, message:string) {
    console.error(message);
}

class PageState {
    @observable
    nextNewObjectId:number = -2;

    @observable
    private current_: State.IPage = { type: State.PAGE_TYPE.Dashbord };

    get current() {
        return this.current_;
    }

    set current(p: State.IPage) {
        switch(p.type) {
        case State.PAGE_TYPE.Deployment:
        case State.PAGE_TYPE.Dashbord:
        case State.PAGE_TYPE.ObjectList:
        case State.PAGE_TYPE.Object:
            if (!state.objects.has(p.id))
                state.objects.set(p.id, new ObjectState(p.id));
            state.objects.get(p.id).loadCurrent();
            break;
        case State.PAGE_TYPE.DeploymentDetails:
        case State.PAGE_TYPE.DockerImages:
            state.dockerImages.load();
            break;
        case State.PAGE_TYPE.DockerContainers:
            state.dockerContainers.load();
            break;
        case State.PAGE_TYPE.ModifiedFiles:
        case State.PAGE_TYPE.ModifiedFile:
            state.modifiedFiles.load();
            break;
        case State.PAGE_TYPE.DockerContainerDetails:
        case State.PAGE_TYPE.DockerContainerHistory:
            state.dockerContainers.loadHistory(p.host, p.container);
            break;
        case State.PAGE_TYPE.DockerImageHistory:
            state.dockerImages.loadImageHistory(p.project, p.tag);
            break;
        default:
            never(p, "Unhandled page");
        }
        this.current_ = p;
    }

    onClick(e: React.MouseEvent<{}>, page: State.IPage) {
        if (e.metaKey || e.ctrlKey || e.button === 2) return;
        e.preventDefault();
        this.set(page);
    }

    @action
    set(page: State.IPage) {
        let pg = Object.assign({}, page);
        if (pg.type == State.PAGE_TYPE.Object && pg.id === null) {
            pg.id = this.nextNewObjectId;
            --this.nextNewObjectId;
        }
        history.pushState(pg, null, this.link(pg));

        this.current = pg;
    }

    link(page: State.IPage): string {
        var o: {[string:string]:string} = {}
        switch(page.type) {
        case State.PAGE_TYPE.Deployment:
            o['page'] = 'deployment';
            break;
        case State.PAGE_TYPE.Dashbord:
            o['page'] = 'dashbord';
            break;
        case State.PAGE_TYPE.ObjectList:
            o['page'] = 'objectlist';
            o['type'] = ""+page.objectType;
            break;
        case State.PAGE_TYPE.Object:
            o['page'] = 'object';
            o['type'] = ""+page.objectType;
            if (page.id !== null) o['id'] = ""+page.id;
            else o['id'] == '-1';
            if (page.version !== null) o['version'] = ""+page.version;
            break;
        case State.PAGE_TYPE.DeploymentDetails:
            o['page'] = 'deploymentDetails'
            o['index'] = ""+page.index;
            break;
        case State.PAGE_TYPE.DockerImages:
            o['page'] = 'dockerImages';
            break;
        case State.PAGE_TYPE.DockerContainers:
            o['page'] = 'dockerContainers';
            break;
        case State.PAGE_TYPE.ModifiedFiles:
            o['page'] = 'modifiedFiles';
            break;
        case State.PAGE_TYPE.ModifiedFile:
            o['page'] = 'modifiedFile';
            o['id'] = ""+page.id;
            break;
        case State.PAGE_TYPE.DockerContainerDetails:
            o['page'] = 'dockerContainerDetails';
            o['host'] = ""+page.host;
            o['container'] = page.container;
            o['id'] = ""+page.id;
            break;
        case State.PAGE_TYPE.DockerContainerHistory:
            o['page'] = 'dockerContainerHistory';
            o['host'] = ""+page.host;
            o['container'] = page.container;
            break;
        case State.PAGE_TYPE.DockerImageHistory:
            o['page'] = 'dockerImageHistory';
            o['project'] = ""+page.project;
            o['tag'] = page.tag;
            break;
        default:
            never(page, "Unhandled page");
        }
        return "?"+$.param(o)
    }
    
    @action
    setFromUrl() {
        const getUrlParameter = (name:string) => {
            name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
            var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
            var results = regex.exec(location.search);
            return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
        };

        let p = getUrlParameter('page');
        switch (p) {
        default:
            this.current = {type: State.PAGE_TYPE.Dashbord};
            break;
        case 'dockerImages':
            this.current = {type: State.PAGE_TYPE.DockerImages};
            break;
        case 'dockerContainers':
            this.current = {type: State.PAGE_TYPE.DockerContainers}
            break;
        case 'modifiedFiles':
            this.current = {type: State.PAGE_TYPE.ModifiedFiles}
            break;
        case 'modifiedFile':
            this.current = {type: State.PAGE_TYPE.ModifiedFile, id: +getUrlParameter('id')};
            break;
        case 'deployment':
            this.current = {type: State.PAGE_TYPE.Deployment};
            break;
        case 'objectlist':
            this.current = {type: State.PAGE_TYPE.ObjectList, objectType: +getUrlParameter('type')};
            break;
        case 'object':
            let v=getUrlParameter('version');
            this.current_ = {type: State.PAGE_TYPE.Object, objectType: +getUrlParameter('type'), id: +getUrlParameter('id'), version: (v?+v:null)};
            if (!state.objects.has(this.current_.id))
                state.objects.set(this.current_.id, new ObjectState(this.current_.id));
            state.objects.get(this.current_.id).loadCurrent();
            break;
        case 'deploymentDetails':
            this.current = {type: State.PAGE_TYPE.DeploymentDetails, index: +getUrlParameter('index')};
            break;
        case 'dockerContainerDetails':
            this.current = {type: State.PAGE_TYPE.DockerContainerDetails, host: +getUrlParameter("host"), container: getUrlParameter("container"), id: +getUrlParameter("id")};
            break;
        case 'dockerContainerHistory':
            this.current = {type: State.PAGE_TYPE.DockerContainerHistory, host: +getUrlParameter("host"), container: getUrlParameter("container")};
            break;
        case 'dockerImageHistory':
            this.current = {type: State.PAGE_TYPE.DockerImageHistory, project: getUrlParameter("project"), tag: getUrlParameter("tag")};
            break;
        }
    }
};

export default PageState;








