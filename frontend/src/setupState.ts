import { ActionTargets } from "./ActionTargets";
import DockerContainersState from "./DockerContairsState";
import DockerImagesState from "./DockerImagesState";
import LoginState from "./LoginState";
import ModifiedFilesState from "./ModifiedFilesState";
import PageState from "./PageState";
import SearchState from "./SearchState";
import DeploymentState from "./deployment/DeploymentState";
import state from "./state";

function setupState() {
    state.login = new LoginState();
    state.deployment = new DeploymentState();
    state.page = new PageState();
    state.actionTargets = new ActionTargets();
    state.dockerImages = new DockerImagesState();
    state.dockerContainers = new DockerContainersState();
    state.modifiedFiles = new ModifiedFilesState();
    state.search = new SearchState();
}

export default setupState;
