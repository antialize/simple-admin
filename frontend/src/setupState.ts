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
};
