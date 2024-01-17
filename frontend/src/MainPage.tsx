import ObjectList from "./ObjectList";
import Search from "./Search";
import state from "./state";
import {observer} from "mobx-react";
import * as State from "./shared/state";
import {DockerImages, DockerImageHistory} from "./DockerImages";
import Error from "./Error";
import {Typography} from "@mui/material";
import Statuses from "./Statuses";
import {DockerContainerDetails, DockerContainerHistory, DockerContainers} from "./DockerContainers";
import ObjectView from "./ObjectView";
import Messages from "./Messages";
import Deployment from "./Deployment";
import DeploymentDetails from "./deployment/Details";
import {ModifiedFileRevolver, ModifiedFiles} from "./ModifiedFiles";

function never(_: never, message: string) {
    console.error(message);
}

export const MainPage = observer(function MainPage() {
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;

    const p = page.current;
    switch (p.type) {
        case State.PAGE_TYPE.Dashbord:
            return (
                <>
                    <Typography variant="h4" component="h4" color="textPrimary">
                        Dashbord
                    </Typography>
                    <Messages />
                    <Statuses />
                </>
            );
        case State.PAGE_TYPE.ObjectList:
            return <ObjectList type={p.objectType} />;
        case State.PAGE_TYPE.Object:
            return <ObjectView type={p.objectType} id={p.id} version={p.version} />;
        case State.PAGE_TYPE.Deployment:
            return <Deployment />;
        case State.PAGE_TYPE.DeploymentDetails:
            return (
                <div>
                    <DeploymentDetails index={p.index} />
                </div>
            );
        case State.PAGE_TYPE.DockerImages:
            return <DockerImages />;
        case State.PAGE_TYPE.DockerContainers:
            return <DockerContainers />;
        case State.PAGE_TYPE.ModifiedFiles:
            return <ModifiedFiles />;
        case State.PAGE_TYPE.ModifiedFile:
            return <ModifiedFileRevolver id={p.id} />;
        case State.PAGE_TYPE.DockerContainerDetails:
            return <DockerContainerDetails />;
        case State.PAGE_TYPE.DockerContainerHistory:
            return <DockerContainerHistory />;
        case State.PAGE_TYPE.DockerImageHistory:
            return <DockerImageHistory />;
        case State.PAGE_TYPE.Search:
            return <Search />;
        default:
            never(p, "Unhandled page type");
    }
    return <Error>I should not get here</Error>;
});
