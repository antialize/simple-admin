import { Typography } from "@mui/material";
import { observer } from "mobx-react";
import Deployment from "./Deployment";
import {
    DockerContainerDetails,
    DockerContainerHistory,
    DockerContainers,
} from "./DockerContainers";
import { DockerImageHistory, DockerImages } from "./DockerImages";
import DisplayError from "./Error";
import Messages from "./Messages";
import { ModifiedFileRevolver, ModifiedFiles } from "./ModifiedFiles";
import ObjectList from "./ObjectList";
import ObjectView from "./ObjectView";
import Search from "./Search";
import Statuses from "./Statuses";
import DeploymentDetails from "./deployment/Details";
import * as State from "./shared/state";
import state from "./state";

function never(_: never, message: string) {
    console.error(message);
}

export const MainPage = observer(function MainPage() {
    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;

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
    return <DisplayError>I should not get here</DisplayError>;
});
