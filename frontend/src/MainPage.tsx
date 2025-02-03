import { Typography } from "@mui/material";
import { observer } from "mobx-react";
import Deployment from "./Deployment";
import { DockerImageHistory, DockerImages } from "./DockerImages";
import { DockerServiceDetails, DockerServiceHistory, DockerServices } from "./DockerServices";
import DisplayError from "./Error";
import Messages from "./Messages";
import { ModifiedFileRevolver, ModifiedFiles } from "./ModifiedFiles";
import ObjectList from "./ObjectList";
import ObjectView from "./ObjectView";
import Search from "./Search";
import Statuses from "./Statuses";
import DeploymentDetails from "./deployment/Details";
import { PAGE_TYPE } from "./shared_types";
import state from "./state";

function never(_: never, message: string) {
    console.error(message);
}

export const MainPage = observer(function MainPage() {
    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;

    const p = page.current;
    switch (p.type) {
        case PAGE_TYPE.Dashbord:
            return (
                <>
                    <Typography variant="h4" component="h4" color="textPrimary">
                        Dashbord
                    </Typography>
                    <Messages />
                    <Statuses />
                </>
            );
        case PAGE_TYPE.ObjectList:
            return <ObjectList type={p.objectType} />;
        case PAGE_TYPE.Object:
            return <ObjectView type={p.objectType} id={p.id} version={p.version} />;
        case PAGE_TYPE.Deployment:
            return <Deployment />;
        case PAGE_TYPE.DeploymentDetails:
            return (
                <div>
                    <DeploymentDetails index={p.index} />
                </div>
            );
        case PAGE_TYPE.DockerImages:
            return <DockerImages />;
        case PAGE_TYPE.DockerServices:
            return <DockerServices />;
        case PAGE_TYPE.ModifiedFiles:
            return <ModifiedFiles />;
        case PAGE_TYPE.ModifiedFile:
            return <ModifiedFileRevolver id={p.id} />;
        case PAGE_TYPE.DockerContainerDetails:
            return <DockerServiceDetails />;
        case PAGE_TYPE.DockerContainerHistory:
            return <DockerServiceHistory />;
        case PAGE_TYPE.DockerImageHistory:
            return <DockerImageHistory />;
        case PAGE_TYPE.Search:
            return <Search />;
        default:
            never(p, "Unhandled page type");
    }
    return <DisplayError>I should not get here</DisplayError>;
});
