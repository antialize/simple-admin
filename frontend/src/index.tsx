import * as React from "react";
import * as ReactDOM from "react-dom";
import Statuses from './statuses'
import * as State from '../../shared/state';
import { IAction, ACTION, CONNECTION_STATUS, IRequestAuthStatus } from '../../shared/actions'
import Object from './object'
import Menu from './menu'
import ObjectList from './objectList'
import Messages from './messages';
import { remoteHost } from './config';
import { Deployment } from './deployment';
import { add, clear } from './deployment/log';
import * as Cookies from 'js-cookie';
import { Login } from './login';
import * as chart from './chart';
import state, { ObjectState, StatusState } from "./state";
import {observer} from "mobx-react";
import setupState from './setupState';
import {runInAction} from "mobx";
import DeploymentDetails from './deploymentDetails';
import { typeId } from "../../shared/type";
import { withStyles } from '@material-ui/core/styles';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles'; 
import Typography from "@material-ui/core/Typography";
import { withTheme } from '@material-ui/core/styles';
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";
import {HotKeys} from 'react-hotkeys';

function never(n: never, message: string) {
    console.error(message);
}

export const MainPage = observer(()=>{
    const p = state.page.current;
    switch (p.type) {
        case State.PAGE_TYPE.Dashbord:
            return <>
                <Typography variant="h4" component="h3">
                    Dashbord
                </Typography>
                <Messages />
                <Statuses />
            </>;
        case State.PAGE_TYPE.ObjectList:
            return <ObjectList type={p.objectType} />;
        case State.PAGE_TYPE.Object:
            return <div><Object type={p.objectType} id={p.id} version={p.version} /> </div>
        case State.PAGE_TYPE.Deployment:
            return <Deployment />
        case State.PAGE_TYPE.DeploymentDetails:
            return <div><DeploymentDetails index={p.index} /></div>
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
setupState();
state.sendMessage = sendMessage;

let socket: WebSocket;
let reconnectTime = 1;

const setupSocket = () => {
    if (reconnectTime < 1000 * 10)
        reconnectTime = reconnectTime * 2;
    state.connectionStatus =  CONNECTION_STATUS.CONNECTING;
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

        switch (d.type) {
        case ACTION.Alert:
            alert(d.message);
            break;
        case ACTION.SetConnectionStatus:
            state.connectionStatus = d.status;
            break;
        case ACTION.StatBucket:
        case ACTION.StatValueChanges:
            chart.handleAction(d);
            break;
        case ACTION.UpdateStatus:
            runInAction(() => {
                if (!state.status.has(d.host))
                    state.status.set(d.host, new StatusState());
                state.status.get(d.host).applyStatusUpdate(d.update);
            });
            break;
        case ACTION.HostDown:
            runInAction(() => {
                if (state.status.has(d.id)) state.status.get(d.id).up = false;
            });
            break;;
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

                for (let status in d.statuses) {
                    const s = new StatusState();
                    s.setFromInitialState(d.statuses[status]);
                    state.status.set(+status, s);
                }
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
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        let msg: IRequestAuthStatus = { type: ACTION.RequestAuthStatus, session: Cookies.get("simple-admin-session") };
        sendMessage(msg);
    }

    socket.onclose = () => {
        state.connectionStatus = CONNECTION_STATUS.WAITING
        socket = null;
        setTimeout(() => setupSocket(), reconnectTime);
    };
};

setupSocket();

window.onpopstate = (e) => {
    state.page.set(e.state as State.IPage);
};


const Content = observer(()=>{
    let dialog: JSX.Element = null;
    if (state.connectionStatus != CONNECTION_STATUS.INITED) {
        dialog = <Login />;

    }
    if (state.loaded) {
        return (<>
            <Menu/>
            <main>
                <MainPage />
            </main>
         </>)
    } else {
        return dialog;
    }
});

const theme = createMuiTheme({
    overrides: {
        MuiDialogActions: {
            root:  {
                margin: 20
            }
        },
        MuiMenu: {
            paper: {
                minWidth: 250,
            }
        }
    },
    palette: {
        type: "dark",
      },
   });

document.body.style.backgroundColor = theme.palette.background.default;

ReactDOM.render(
    <MuiThemeProvider theme={theme}>
        <Content />
    </MuiThemeProvider>
    , document.getElementById("main"));
