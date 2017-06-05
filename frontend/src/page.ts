import * as React from "react";
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {IMainState} from './reducers';
import * as $ from 'jquery'

let nextNewObjectId=-2;

function never(n:never, message:string) {
    console.error(message);
}

export function setPage(page: State.IPage, dispatch:Dispatch<IMainState>) {
    let pg = Object.assign({}, page);
    if (pg.type == State.PAGE_TYPE.Object && pg.id === null) {
        pg.id = nextNewObjectId;
        --nextNewObjectId;
    }
    history.pushState(page, null, link(pg));
    let p:Actions.ISetPageAction = {
        type: Actions.ACTION.SetPage,
        page: pg
    };
    dispatch(p);
}

export function onClick(e: React.MouseEvent<{}>, page: State.IPage,dispatch:Dispatch<IMainState>) {
    if (e.metaKey || e.ctrlKey || e.button === 2) return;
    e.preventDefault();
    setPage(page, dispatch);
}

export function link(page: State.IPage) {
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
    default:
        never(page, "Unhandled page");
    }
    return "?"+$.param(o)
}

function getUrlParameter(name:string) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

export function get(): State.IPage {
    let p = getUrlParameter('page');
    switch (p) {
    default:
        return {type: State.PAGE_TYPE.Dashbord};
    case 'deployment':
        return {type: State.PAGE_TYPE.Deployment};
    case 'objectlist':
        return {type: State.PAGE_TYPE.ObjectList, objectType: +getUrlParameter('type')};
    case 'object':
        let v=getUrlParameter('version');
        return {type: State.PAGE_TYPE.Object, objectType: +getUrlParameter('type'), id: +getUrlParameter('id'), version: (v?+v:null)};
    case 'deploymentDetails':
        return {type: State.PAGE_TYPE.DeploymentDetails, index: +getUrlParameter('index')};
    }
}