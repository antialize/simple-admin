import Cookies from "js-cookie";
import { runInAction } from "mobx";
import { add, clear } from "./deployment/Log";
import getOrInsert from "./getOrInsert";
import { getReferences } from "./getReferences";
import nullCheck from "./nullCheck";
import ObjectState from "./ObjectState";
import {
    type IClientAction,
    type IObjectDigest,
    type IServerAction,
    TYPE_ID,
} from "./shared_types";
import state, { CONNECTION_STATUS } from "./state";

export let socket: WebSocket | null = null;
let reconnectTime = 1;

export const setupSocket = () => {
    if (reconnectTime < 1000 * 10) reconnectTime = reconnectTime * 2;
    state.connectionStatus = CONNECTION_STATUS.CONNECTING;
    socket = new WebSocket(
        `${
            (window.location.protocol === "http:" ? "ws://" : "wss://") + window.location.host
        }/sysadmin`,
    );
    socket.onmessage = (data) => {
        const loaded = state.loaded;
        const d = JSON.parse(data.data) as IServerAction;
        if (d.type in nullCheck(state.actionTargets)) {
            const tt = nullCheck(state.actionTargets).targets.get(d.type);
            if (tt) for (const t of tt) if (t(d)) return;
        }
        if (d.type === "ClearDeploymentLog") {
            clear();
            return;
        }
        if (d.type === "AddDeploymentLog") {
            add(d.bytes);
            return;
        }
        switch (d.type) {
            case "SetPage":
                nullCheck(state.page).set(d.page);
                break;
            case "Alert":
                alert(d.message);
                break;
            case "HostDown":
                state.hostsUp.delete(d.id);
                break;
            case "HostUp":
                state.hostsUp.add(d.id);
                break;
            case "AuthStatus":
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
                    state.sendMessage({ type: "RequestInitialState" });
                }
                break;
            case "SetInitialState":
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
                    for (const id in d.types) state.types.set(+id, nullCheck(d.types[id]));
                    for (const id in d.objectNamesAndIds) {
                        const m = new Map<number, IObjectDigest>();
                        for (const ent of nullCheck(d.objectNamesAndIds[id])) m.set(ent.id, ent);
                        state.objectDigests.set(+id, m);
                    }
                    for (const msg of d.messages) state.messages.set(msg.id, msg);
                    for (const id of d.hostsUp) state.hostsUp.add(id);
                    if (!loaded) nullCheck(state.page).setFromUrl();
                    nullCheck(state.page).loadContent();
                });
                break;
            case "SetMessagesDismissed":
                runInAction(() => {
                    for (const id of d.ids) {
                        const msg = state.messages.get(id);
                        if (msg) msg.dismissed = d.dismissed;
                    }
                });
                break;
            case "AddMessage":
                runInAction(() => {
                    state.messages.set(d.message.id, d.message);
                });
                break;
            case "ObjectChanged":
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
                        if (last.type === TYPE_ID) state.types.set(last.id, last);
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
            case "GetObjectHistoryRes":
                runInAction(() => {
                    nullCheck(state.objects.get(d.id)).history = d.history;
                });
                break;
            case "SetDeploymentStatus":
                nullCheck(state.deployment).status = d.status;
                break;
            case "SetDeploymentMessage":
                nullCheck(state.deployment).message = d.message;
                break;
            case "SetDeploymentObjects":
                nullCheck(state.deployment).objects = d.objects;
                break;
            case "SetDeploymentObjectStatus":
                nullCheck(state.deployment).objects[d.index].status = d.status;
                break;
            case "ToggleDeploymentObject":
                runInAction(() => {
                    if (d.index === null)
                        for (const o of nullCheck(state.deployment).objects) o.enabled = d.enabled;
                    else nullCheck(state.deployment).objects[d.index].enabled = d.enabled;
                });
                break;
            case "DockerListImageTagsRes":
                nullCheck(state.dockerImages).handleLoad(d);
                break;
            case "SearchRes":
                nullCheck(state.search).handleSearch(d);
                break;
            case "DockerListImageTagsChanged":
                nullCheck(state.dockerImages).handleChange(d);
                break;
            case "DockerListImageTagHistoryRes":
                nullCheck(state.dockerImages).handleLoadHistory(d);
                break;
            case "DockerListDeploymentsRes":
                nullCheck(state.dockerContainers).handleLoad(d);
                break;
            case "DockerListDeploymentHistoryRes":
                nullCheck(state.dockerContainers).handleLoadHistory(d);
                break;
            case "DockerDeploymentsChanged":
                nullCheck(state.dockerContainers).handleChange(d);
                break;
            case "ModifiedFilesChanged":
                nullCheck(state.modifiedFiles).handleChange(d);
                break;
        }
    };
    socket.onopen = () => {
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        const msg: IClientAction = {
            type: "RequestAuthStatus",
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
