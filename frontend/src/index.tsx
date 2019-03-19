import * as React from "react";
import * as ReactDOM from "react-dom";
import { Store, createStore, applyMiddleware } from 'redux';
import { Provider, connect } from 'react-redux';
import { mainReducer, IMainState } from './reducers'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import Statuses from './statuses'
import * as State from '../../shared/state';
import { IAction, ACTION, IFetchObject, IAlert, CONNECTION_STATUS, ISetConnectionStatus, IRequestAuthStatus } from '../../shared/actions'
import * as $ from "jquery";
import * as page from './page'

import Object from './object'
import Menu from './menu'
import ObjectList from './objectList'
import CircularProgress from 'material-ui/CircularProgress';
import Messages from './messages';
import { remoteHost } from './config';
import { Deployment } from './deployment';
import { add, clear } from './deployment/log';
import Dialog from 'material-ui/Dialog';
import { debugStyle } from './debug'
import * as Cookies from 'js-cookie';
import { Login } from './login';
import * as chart from './chart';
import state, { ObjectState } from "./state";
import {observer} from "mobx-react";
import setupState from './setupState';
import {action, runInAction} from "mobx";
import DeploymentDetails from './deploymentDetails';
import { typeId } from "../../shared/type";

function never(n: never, message: string) {
    console.error(message);
}

export const MainPage = observer(()=>{
    const p = state.page.current;
    switch (p.type) {
        case State.PAGE_TYPE.Dashbord:
            return <div style={debugStyle()}>
                <h1>Dashboard</h1>
                <Messages />
                <Statuses />
            </div>;
        case State.PAGE_TYPE.ObjectList:
            return <div style={debugStyle()}><h1>List of {state.types.get(p.objectType).content.plural}</h1><ObjectList type={p.objectType} /></div>
        case State.PAGE_TYPE.Object:
            return <div style={debugStyle()}><Object type={p.objectType} id={p.id} version={p.version} /> </div>
        case State.PAGE_TYPE.Deployment:
            return <div style={debugStyle()}><Deployment /></div>
        case State.PAGE_TYPE.DeploymentDetails:
            return <div style={debugStyle()}><DeploymentDetails index={p.index} /></div>
        default:
            never(p, "Unhandled page type");
    }
});


export interface ActionTarget {
    handle: (action: IAction) => boolean;
}

const actionTargets: { [action: number]: ActionTarget[] } = {};

export function addActionTarget(action: ACTION, target: ActionTarget) {
    if (!(action in actionTargets)) actionTargets[action] = [];
    actionTargets[action].push(target);
}

export function removeActionTarget(action: ACTION, target: ActionTarget) {
    actionTargets[action] = actionTargets[action].filter((t) => t !== target);
}

export function sendMessage(action: IAction) {
    socket.send(JSON.stringify(action));
}

chart.setSend(sendMessage);

setupState();
state.sendMessage = sendMessage;
const store = createStore(mainReducer) as Store<IMainState>;

let socket: WebSocket;
let reconnectTime = 1;

const setupSocket = () => {
    if (reconnectTime < 1000 * 10)
        reconnectTime = reconnectTime * 2;
    store.dispatch({ type: ACTION.SetConnectionStatus, status: CONNECTION_STATUS.CONNECTING });
    socket = new WebSocket('wss://' + remoteHost + '/sysadmin');
    socket.onmessage = data => {
        const loaded = state.loaded;
        const d = JSON.parse(data.data) as IAction;
        if (d.type in actionTargets) {
            for (const t of actionTargets[d.type])
                if (t.handle(d))
                    return;
        }

        if (d.type == ACTION.ClearDeploymentLog) {
            clear();
            return;
        }

        if (d.type == ACTION.AddDeploymentLog) {
            add(d.bytes);
            return;
        }

        store.dispatch(d);
        switch (d.type) {
            case ACTION.Alert:
                alert(d.message);
                return;
            case ACTION.SetConnectionStatus:
                state.connectionStatus = d.status;
                return;
            case ACTION.StatBucket:
            case ACTION.StatValueChanges:
                chart.handleAction(d);
                return;
            case ACTION.AuthStatus:
                runInAction(()=> {
                    if (d.pwd && d.otp)
                        state.connectionStatus = CONNECTION_STATUS.INITING;
                    else
                        state.connectionStatus = CONNECTION_STATUS.LOGIN;
                    if (d.user)
                        state.login.user = d.user;
                    state.authMessage = d.message;
                    state.authOtp = d.otp;
                    state.authUser = d.user;
                });
                return;
            case ACTION.AuthStatus:
                if (d.session !== null) {
                    Cookies.set("simple-admin-session", d.session, { secure: true, expires: 365 });
                }
                if (d.otp && d.pwd) {
                    state.sendMessage({ type: ACTION.RequestInitialState });
                }
                break;
            case ACTION.SetInitialState:
                runInAction(() => {
                    state.deployment.status = d.deploymentStatus;
                    reconnectTime = 1;
                    for (const b of (d.deploymentLog || []))
                        add(b);
                    if (!loaded)
                        state.page.setFromUrl();

                    state.connectionStatus = CONNECTION_STATUS.INITED;
                    state.loaded = true;

                    for (let id in d.types)
                        state.types.set(+id, d.types[id]);

                    for (let id in d.objectNamesAndIds) {
                        let m = new Map<number, State.IObjectDigest>();
                        for (let ent of d.objectNamesAndIds[id])
                            m.set(ent.id, ent);
                        state.objectDigests.set(+id, m);
                    }

                    for (let msg of d.messages)
                        state.messages.set(msg.id, msg);

                });
                break;
            case ACTION.SetMessagesDismissed:
                runInAction(()=>{
                    for (let id of d.ids)
                        state.messages.get(id).dismissed = d.dismissed
                });
                break;
            case ACTION.AddMessage:
                runInAction(()=>{
                    state.messages.set(d.message.id, d.message);
                });
                break;;
            case ACTION.ObjectChanged:
                runInAction(()=>{
                    if (d.object.length == 0) {
                        state.types.delete(d.id);
                        for (const [key, values] of state.objectDigests)
                            values.delete(d.id);
                        state.objects.delete(d.id);
                    } else {
                        const last = d.object[d.object.length -1];
                        if (!state.objectDigests.has(last.type))
                            state.objectDigests.set(last.type, new Map());
                        state.objectDigests.get(last.type).set(d.id, {id: d.id, name: last.name, type: last.type, catagory: last.catagory});

                        if (last.type == typeId)
                            state.types.set(last.id, last);

                        if (!state.objects.has(d.id))
                            state.objects.set(d.id, new ObjectState(d.id));
                        const o = state.objects.get(d.id);
                        for (const obj of d.object)
                            o.versions.set(obj.version, obj);
                        o.loadStatus = "loaded";
                        o.loadCurrent();
                    }
                });
                break;
            case ACTION.SetDeploymentStatus:
                state.deployment.status = d.status;
                break;
            case ACTION.SetDeploymentMessage:
                state.deployment.message = d.message;
                break;
            case ACTION.SetDeploymentObjects:
                state.deployment.objects = d.objects;
                break;
            case ACTION.SetDeploymentObjectStatus:
                state.deployment.objects[d.index].status = d.status;
                break;
            case ACTION.ToggleDeploymentObject:
                runInAction(()=>{
                    if (d.index === null)
                        for (let o of state.deployment.objects)
                            o.enabled = d.enabled;
                    else
                        state.deployment.objects[d.index].enabled = d.enabled;
                });
                break;
        }
    };

    socket.onopen = () => {
        store.dispatch({ type: ACTION.SetConnectionStatus, status: CONNECTION_STATUS.AUTHENTICATING });
        let msg: IRequestAuthStatus = { type: ACTION.RequestAuthStatus, session: Cookies.get("simple-admin-session") };
        sendMessage(msg);
    }

    socket.onclose = () => {
        store.dispatch({ type: ACTION.SetConnectionStatus, status: CONNECTION_STATUS.WAITING });
        socket = null;
        setTimeout(() => setupSocket(), reconnectTime);
    };
};

setupSocket();

window.onpopstate = (e) => {
    let page = e.state as State.IPage;
    store.dispatch({
        type: ACTION.SetPage,
        page: page
    });
};


const Content = observer(()=>{
    let dialog: JSX.Element = null;
    if (state.connectionStatus != CONNECTION_STATUS.INITED) {
        dialog = <Login />;

    }
    if (state.loaded) {
        return (<div style={debugStyle()}>
            <Menu />
            <div style={{ marginLeft: "300px" }}>
                <MainPage />
            </div>
            {dialog}
        </div>)
    } else {
        return dialog;
    }
});

ReactDOM.render(
    <div>
        <MuiThemeProvider>
            <Provider store={store}>
                <Content />
            </Provider>
        </MuiThemeProvider>
    </div>, document.getElementById("main"));
