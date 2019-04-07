import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import PageState from "./PageState";
import state from "./state"
import { ActionTargets } from "./ActionTargets";

function setupState() {
    state.login = new LoginState;
    state.deployment = new DeploymentState;
    state.page = new PageState;
    state.types = new Map;
    state.actionTargets = new ActionTargets;
    state.objectDigests = new Map;
    state.objectListFilter = new Map;
    state.messages = new Map;
    state.messageExpanded = new Map;
    state.messageGroupExpanded = new Map;
    state.serviceListFilter = new Map;
    state.serviceLogVisibility = new Map;
    state.objects = new Map;
    state.status = new Map;
};

export default setupState;
