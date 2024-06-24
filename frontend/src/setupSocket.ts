import Cookies from "js-cookie";
import type * as State from "./shared/state";
import state, { CONNECTION_STATUS } from "./state";
import { type IAction, ACTION, type IRequestAuthStatus } from "./shared/actions";
import { add, clear } from "./deployment/Log";
import { runInAction } from "mobx";
import nullCheck from "./shared/nullCheck";
import getOrInsert from "./shared/getOrInsert";
import { typeId } from "./shared/type";
import ObjectState from "./ObjectState";
import { getReferences } from "./shared/getReferences";

export let socket: WebSocket | null = null;
let reconnectTime = 1;

export const setupSocket = () => {
    if (reconnectTime < 1000 * 10) reconnectTime = reconnectTime * 2;
    state.connectionStatus = CONNECTION_STATUS.CONNECTING;
    socket = new WebSocket(
        (window.location.protocol === "http:" ? "ws://" : "wss://") +
            window.location.host +
            "/sysadmin",
    );
    socket.onmessage = (data) => {
        const loaded = state.loaded;
        const d = JSON.parse(data.data) as IAction;
        if (d.type in nullCheck(state.actionTargets)) {
            const tt = nullCheck(state.actionTargets).targets.get(d.type);
            if (tt) for (const t of tt) if (t(d)) return;
        }
        if (d.type === ACTION.ClearDeploymentLog) {
            clear();
            return;
        }
        if (d.type === ACTION.AddDeploymentLog) {
            add(d.bytes);
            return;
        }
        switch (d.type) {
            case ACTION.SetPage:
                nullCheck(state.page).set(d.page);
                break;
            case ACTION.Alert:
                alert(d.message);
                break;
            case ACTION.HostDown:
                state.hostsUp.delete(d.id);
                break;
            case ACTION.HostUp:
                state.hostsUp.add(d.id);
                break;
            case ACTION.AuthStatus:
                runInAction(() => {
                    if (d.pwd && d.otp) state.connectionStatus = CONNECTION_STATUS.INITING;
                    else state.connectionStatus = CONNECTION_STATUS.LOGIN;
                    if (d.user) nullCheck(state.login).user = d.user;
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
                    for (const [a, b] of d.usedBy) {
                        const aa = state.objectUsedBy.get(a);
                        if (aa) aa.add(b);
                        else state.objectUsedBy.set(a, new Set([b]));
                    }
                    nullCheck(state.modifiedFiles).modifiedFiles = { state: "initial" };
                    nullCheck(state.dockerImages).imageHistory.clear();
                    nullCheck(state.dockerImages).projects = { state: "initial" };
                    nullCheck(state.dockerContainers).containerHistory.clear();
                    nullCheck(state.dockerContainers).hosts = { state: "initial" };
                    nullCheck(state.deployment).objects = d.deploymentObjects;
                    nullCheck(state.deployment).message = d.deploymentMessage;
                    nullCheck(state.deployment).status = d.deploymentStatus;
                    reconnectTime = 1;
                    for (const b of d.deploymentLog || []) add(b);
                    state.connectionStatus = CONNECTION_STATUS.INITED;
                    state.loaded = true;
                    for (const id in d.types) state.types.set(+id, d.types[id]);
                    for (const id in d.objectNamesAndIds) {
                        const m = new Map<number, State.IObjectDigest>();
                        for (const ent of d.objectNamesAndIds[id]) m.set(ent.id, ent);
                        state.objectDigests.set(+id, m);
                    }
                    for (const msg of d.messages) state.messages.set(msg.id, msg);
                    for (const id of d.hostsUp) state.hostsUp.add(id);
                    if (!loaded) nullCheck(state.page).setFromUrl();
                    nullCheck(state.page).loadContent();
                });
                break;
            case ACTION.SetMessagesDismissed:
                runInAction(() => {
                    for (const id of d.ids) {
                        const msg = state.messages.get(id);
                        if (msg) msg.dismissed = d.dismissed;
                    }
                });
                break;
            case ACTION.AddMessage:
                runInAction(() => {
                    state.messages.set(d.message.id, d.message);
                });
                break;
            case ACTION.ObjectChanged:
                runInAction(() => {
                    if (d.object.length === 0) {
                        state.types.delete(d.id);
                        for (const [_, values] of state.objectDigests) values.delete(d.id);
                        state.objects.delete(d.id);
                    } else {
                        const last = d.object[d.object.length - 1];
                        getOrInsert(state.objectDigests, last.type, () => new Map()).set(d.id, {
                            id: d.id,
                            name: last.name,
                            type: last.type,
                            category: last.category,
                            comment: last.comment,
                        });
                        if (last.type === typeId) state.types.set(last.id, last);
                        const o = getOrInsert(state.objects, d.id, () => new ObjectState(d.id));

                        let newest = null;
                        for (const [_, ov] of o.versions) {
                            if (
                                ov.content &&
                                ov.version != null &&
                                (newest == null || ov.version > nullCheck(newest.version))
                            )
                                newest = ov;
                        }
                        if (newest?.content) {
                            for (const ov of getReferences(newest.content)) {
                                const oub = state.objectUsedBy.get(ov);
                                if (oub) oub.delete(d.id);
                            }
                        }
                        if (last) {
                            for (const ov of getReferences(last.content)) {
                                const oub = state.objectUsedBy.get(ov);
                                if (oub) oub.add(d.id);
                                else state.objectUsedBy.set(ov, new Set([d.id]));
                            }
                        }
                        for (const obj of d.object) o.versions.set(nullCheck(obj.version), obj);

                        o.loadStatus = "loaded";
                        o.loadCurrent();
                    }
                });
                break;
            case ACTION.GetObjectHistoryRes:
                runInAction(() => {
                    nullCheck(state.objects.get(d.id)).history = d.history;
                });
                break;
            case ACTION.SetDeploymentStatus:
                nullCheck(state.deployment).status = d.status;
                break;
            case ACTION.SetDeploymentMessage:
                nullCheck(state.deployment).message = d.message;
                break;
            case ACTION.SetDeploymentObjects:
                nullCheck(state.deployment).objects = d.objects;
                break;
            case ACTION.SetDeploymentObjectStatus:
                nullCheck(state.deployment).objects[d.index].status = d.status;
                break;
            case ACTION.ToggleDeploymentObject:
                runInAction(() => {
                    if (d.index === null)
                        for (const o of nullCheck(state.deployment).objects) o.enabled = d.enabled;
                    else nullCheck(state.deployment).objects[d.index].enabled = d.enabled;
                });
                break;
            case ACTION.DockerListImageTagsRes:
                nullCheck(state.dockerImages).handleLoad(d);
                break;
            case ACTION.SearchRes:
                nullCheck(state.search).handleSearch(d);
                break;
            case ACTION.DockerListImageTagsChanged:
                nullCheck(state.dockerImages).handleChange(d);
                break;
            case ACTION.DockerListImageTagHistoryRes:
                nullCheck(state.dockerImages).handleLoadHistory(d);
                break;
            case ACTION.DockerListDeploymentsRes:
                nullCheck(state.dockerContainers).handleLoad(d);
                break;
            case ACTION.DockerListDeploymentHistoryRes:
                nullCheck(state.dockerContainers).handleLoadHistory(d);
                break;
            case ACTION.DockerDeploymentsChanged:
                nullCheck(state.dockerContainers).handleChange(d);
                break;
            case ACTION.ModifiedFilesChanged:
                nullCheck(state.modifiedFiles).handleChange(d);
                break;
        }
    };
    socket.onopen = () => {
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        const msg: IRequestAuthStatus = {
            type: ACTION.RequestAuthStatus,
            session: Cookies.get("simple-admin-session"),
        };
        state.sendMessage(msg);
    };
    socket.onclose = () => {
        state.connectionStatus = CONNECTION_STATUS.WAITING;
        socket = null;
        setTimeout(() => {
            setupSocket();
        }, reconnectTime);
    };
};
