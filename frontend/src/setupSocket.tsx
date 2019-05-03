import * as Cookies from 'js-cookie';
import * as State from '../../shared/state';
import * as chart from './Chart';
import ObjectState from "./ObjectState";
import StatusState from "./StatusState";
import state, { CONNECTION_STATUS } from "./state";
import { IAction, ACTION, IRequestAuthStatus } from '../../shared/actions';
import { add, clear } from './deployment/Log';
import { remoteHost } from './config';
import { runInAction } from "mobx";
import { typeId } from "../../shared/type";

export let socket: WebSocket;
let reconnectTime = 1;

export const setupSocket = () => {
    if (reconnectTime < 1000 * 10)
        reconnectTime = reconnectTime * 2;
    state.connectionStatus = CONNECTION_STATUS.CONNECTING;
    socket = new WebSocket('wss://' + remoteHost + '/sysadmin');
    socket.onmessage = data => {
        const loaded = state.loaded;
        const d = JSON.parse(data.data) as IAction;
        if (d.type in state.actionTargets) {
            for (const t of state.actionTargets.targets.get(d.type))
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
            case ACTION.SetPage:
                state.page.set(d.page);
                break;
            case ACTION.Alert:
                alert(d.message);
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
                    if (state.status.has(d.id))
                        state.status.get(d.id).up = false;
                });
                break;
                ;
            case ACTION.AuthStatus:
                runInAction(() => {
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
                    state.modifiedFiles.loaded = false;
                    state.dockerImages.imageHistory.clear();
                    state.dockerImages.projects = {state: 'initial'};
                    state.dockerContainers.containerHistory.clear();
                    state.dockerContainers.hosts = {state: 'initial'};
                    state.deployment.objects = d.deploymentObjects;
                    state.deployment.message = d.deploymentMessage;
                    state.deployment.status = d.deploymentStatus;
                    reconnectTime = 1;
                    for (const b of (d.deploymentLog || []))
                        add(b);
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
                    if (!loaded)
                        state.page.setFromUrl();
                });
                break;
            case ACTION.SetMessagesDismissed:
                runInAction(() => {
                    for (let id of d.ids)
                        state.messages.get(id).dismissed = d.dismissed;
                });
                break;
            case ACTION.AddMessage:
                runInAction(() => {
                    state.messages.set(d.message.id, d.message);
                });
                break;
                ;
            case ACTION.ObjectChanged:
                runInAction(() => {
                    if (d.object.length == 0) {
                        state.types.delete(d.id);
                        for (const [key, values] of state.objectDigests)
                            values.delete(d.id);
                        state.objects.delete(d.id);
                    }
                    else {
                        const last = d.object[d.object.length - 1];
                        if (!state.objectDigests.has(last.type))
                            state.objectDigests.set(last.type, new Map());
                        state.objectDigests.get(last.type).set(d.id, { id: d.id, name: last.name, type: last.type, category: last.category });
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
                runInAction(() => {
                    if (d.index === null)
                        for (let o of state.deployment.objects)
                            o.enabled = d.enabled;
                    else
                        state.deployment.objects[d.index].enabled = d.enabled;
                });
                break;
            case ACTION.DockerListImageTagsRes:
                state.dockerImages.handleLoad(d);
                break;
            case ACTION.DockerListImageTagsChanged:
                state.dockerImages.handleChange(d);
                break;
            case ACTION.DockerListImageTagHistoryRes:
                state.dockerImages.handleLoadHistory(d);
                break;
            case ACTION.DockerListDeploymentsRes:
                state.dockerContainers.handleLoad(d);
                break;
            case ACTION.DockerListDeploymentHistoryRes:
                state.dockerContainers.handleLoadHistory(d);
                break;
            case ACTION.DockerDeploymentsChanged:
                state.dockerContainers.handleChange(d);
                break;
            case ACTION.ModifiedFilesChanged:
                state.modifiedFiles.handleChange(d);
                break;
        }
    };
    socket.onopen = () => {
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        let msg: IRequestAuthStatus = { type: ACTION.RequestAuthStatus, session: Cookies.get("simple-admin-session") };
        state.sendMessage(msg);
    };
    socket.onclose = () => {
        state.connectionStatus = CONNECTION_STATUS.WAITING;
        socket = null;
        setTimeout(() => setupSocket(), reconnectTime);
    };
};
