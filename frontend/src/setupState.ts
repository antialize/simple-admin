import state from "./state"
import {LoginState} from "./login"
import { DeploymentState } from "./deployment";
import { PageState } from "./page";

export default () => {
    state.login = new LoginState;
    state.deployment = new DeploymentState;
    state.page = new PageState;
    state.types = new Map;
    state.objectDigests = new Map;
    state.objectListFilter = new Map;
    state.messages = new Map;
    state.messageExpanded = new Map;
    state.messageGroupExpanded = new Map;
    state.serviceListFilter = new Map;
    state.serviceLogVisibility = new Map;
    state.objects = new Map;
};
