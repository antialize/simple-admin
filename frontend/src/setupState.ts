import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import PageState from "./PageState";
import state from "./state"
import { ActionTargets } from "./ActionTargets";
import DockerImagesState from "./DockerImagesState";
import DockerContainersState from "./DockerContairsState";
import SearchState from "./SearchState";
import ModifiedFilesState from "./ModifiedFilesState";

function setupState() {
    state.login = new LoginState;
    state.deployment = new DeploymentState;
    state.page = new PageState;
    state.actionTargets = new ActionTargets;
    state.dockerImages = new DockerImagesState;
    state.dockerContainers = new DockerContainersState;
    state.modifiedFiles = new ModifiedFilesState;
    state.search = new SearchState;
};

export default setupState;
