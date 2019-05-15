import * as React from 'react';
import Deployment from './Deployment';
import DeploymentDetails from './deployment/Details';
import Messages from './Messages';
import ObjectView from './ObjectView';
import ObjectList from './ObjectList';
import Statuses from './Statuses';
import Typography from "@material-ui/core/Typography";
import state from "./state";
import { observer } from "mobx-react";
import * as State from '../../shared/state';
import { DockerImages, DockerImageHistory } from './DockerImages';
import { DockerContainers, DockerContainerDetails, DockerContainerHistory } from './DockerContainers';
import { ModifiedFiles, ModifiedFileRevolver } from './ModifiedFiles';
import Error from './Error';

function never(n: never, message: string) {
    console.error(message);
}
export const MainPage = observer(function MainPage() {
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;

    const p = page.current;
    switch (p.type) {
    case State.PAGE_TYPE.Dashbord:
        return <>
            <Typography variant="h4" component="h3">
                Dashbord
            </Typography>
            <Messages />
            <Statuses />
        </>;
    case State.PAGE_TYPE.ObjectList:
        return <ObjectList type={p.objectType} />;
    case State.PAGE_TYPE.Object:
        return <div><ObjectView type={p.objectType} id={p.id} version={p.version} /> </div>;
    case State.PAGE_TYPE.Deployment:
        return <Deployment />;
    case State.PAGE_TYPE.DeploymentDetails:
        return <div><DeploymentDetails index={p.index} /></div>;
    case State.PAGE_TYPE.DockerImages:
        return <DockerImages/>;
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
    default:
        never(p, "Unhandled page type");
    }
    return <Error>I should not get here</Error>;
});
