import { ActionTargets } from "./ActionTargets";
import DockerImagesState from "./DockerImagesState";
import DockerrvicesState from "./DockerServicesState";
import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import ModifiedFilesState from "./ModifiedFilesState";
import PageState from "./PageState";
import SearchState from "./SearchState";
import state from "./state";

function setupState() {
    state.login = new LoginState();
    state.deployment = new DeploymentState();
    state.page = new PageState();
    state.actionTargets = new ActionTargets();
    state.dockerImages = new DockerImagesState();
    state.dockerContainers = new DockerrvicesState();
    state.modifiedFiles = new ModifiedFilesState();
    state.search = new SearchState();
}

export default setupState;
