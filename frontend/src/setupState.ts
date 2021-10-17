import DeploymentState from "./deployment/DeploymentState";
import LoginState from "./LoginState";
import PageState from "./PageState";
import state from "./state"
import { ActionTargets } from "./ActionTargets";
import { DockerImagesState } from "./DockerImages";
import { DockerContainersState } from "./DockerContainers";
import { ModifiedFilesState } from "./ModifiedFiles";
import { DockerDeployState } from "./DockerDeploy";
import { SearchState } from "./Search";

function setupState() {
    state.login = new LoginState;
    state.deployment = new DeploymentState;
    state.page = new PageState;
    state.actionTargets = new ActionTargets;
    state.dockerImages = new DockerImagesState;
    state.dockerContainers = new DockerContainersState;
    state.modifiedFiles = new ModifiedFilesState;
    state.dockerDeploy = new DockerDeployState;
    state.search = new SearchState;
};

export default setupState;
