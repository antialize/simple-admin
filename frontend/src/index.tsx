import * as React from "react";
import * as ReactDOM from "react-dom";
import { Store, createStore, applyMiddleware } from 'redux';
import { Provider, connect } from 'react-redux';
import { mainReducer, IMainState } from './reducers'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import { Statuses } from './statuses'
import * as State from '../../shared/state';
import { IAction, ACTION, IFetchObject, IAlert, CONNECTION_STATUS, ISetConnectionStatus, IRequestAuthStatus } from '../../shared/actions'
import * as $ from "jquery";
import * as page from './page'

import { Object } from './object'
import Menu from './menu'
import { ObjectList } from './objectList'
import CircularProgress from 'material-ui/CircularProgress';
import { Messages } from './messages';
import { remoteHost } from './config';
import { Deployment } from './deployment';
import { add, clear } from './deployment/log';
import Dialog from 'material-ui/Dialog';
import { debugStyle } from './debug'
import * as Cookies from 'js-cookie';
import { Login } from './login';
import * as chart from './chart';
import state from "./state";
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
    // TODO(jakob)
    /*if (p.type == State.PAGE_TYPE.ObjectList)
        type = s.types[p.objectType].content.plural;*/
    const type="TODO;"
    switch (p.type) {
        case State.PAGE_TYPE.Dashbord:
            return <div style={debugStyle()}>
                <h1>Dashboard</h1>
                <Messages />
                <Statuses />
            </div>;
        case State.PAGE_TYPE.ObjectList:
            return <div style={debugStyle()}><h1>List of {type}</h1><ObjectList type={p.objectType} /></div>
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

const handleRemote = (store: Store<IMainState>) => (next: (a: IAction) => any) => (act: IAction) => {
    switch (act.type) {
        case ACTION.SetConnectionStatus:
            state.connectionStatus = act.status;
            return;
        case ACTION.AuthStatus:
            runInAction(()=> {
                if (act.pwd && act.otp)
                    state.connectionStatus = CONNECTION_STATUS.INITING;
                else
                    state.connectionStatus = CONNECTION_STATUS.LOGIN;
                if (act.user)
                    state.login.user = act.user;
                state.authMessage = act.message;
                state.authOtp = act.otp;
                state.authUser = act.user;
            });
            return;
        case ACTION.StatBucket:
        case ACTION.StatValueChanges:
            chart.handleAction(act);
            return;
        case ACTION.SetPage:
            switch (act.page.type) {
                case State.PAGE_TYPE.Object:
                    const objects = store.getState().objects;
                    if (!(act.page.id in objects) || !(1 in objects[act.page.id].versions)) {
                        let a: IFetchObject = {
                            type: ACTION.FetchObject,
                            id: act.page.id
                        };
                        sendMessage(a);
                    }
                    break;
            }
            break;
        case ACTION.SaveObject:
            act.obj = store.getState().objects[act.id].current;
            sendMessage(act);
            break;
        case ACTION.DeployObject:
        case ACTION.DeleteObject:
        case ACTION.StopDeployment:
        case ACTION.StartDeployment:
        case ACTION.CancelDeployment:
        case ACTION.PokeService:
        case ACTION.MessageTextReq:
            sendMessage(act);
            return;
        case ACTION.ToggleDeploymentObject:
            if (act.source == "webclient") {
                sendMessage(act);
                return;
            }
            break;
        case ACTION.SetMessagesDismissed:
            if (act.source == "webclient") {
                sendMessage(act);
                return;
            }
            break;
        case ACTION.Alert:
            alert(act.message);
            return;
    }
    return next(act);
}


setupState();
state.sendMessage = sendMessage;
const store = createStore(mainReducer, applyMiddleware(handleRemote as any)) as Store<IMainState>;

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

                    for (let id in d.types) {
                        state.types.set(+id, d.types[id]);
                    }
                });
                break;
            case ACTION.ObjectChanged:
                if (d.object.length == 0)
                    state.types.delete(d.id);
                else if (d.object[d.object.length -1].type == typeId) {
                    state.types.set(d.object[d.object.length -1].id, d.object[d.object.length -1]);
                }
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
