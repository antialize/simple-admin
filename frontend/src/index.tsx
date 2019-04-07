import * as React from "react";
import * as ReactDOM from "react-dom";
import * as State from '../../shared/state';
import Deployment from './Deployment';
import DeploymentDetails from './deployment/Details';
import Login from './Login';
import Menu from './Menu';
import Messages from './Messages';
import Object from './Object';
import ObjectList from './ObjectList';
import Statuses from './Statuses';
import Typography from "@material-ui/core/Typography";
import setupState from './setupState';
import state, { CONNECTION_STATUS } from "./state";
import theme from "./theme";
import { IAction } from '../../shared/actions';
import { MuiThemeProvider } from '@material-ui/core/styles'; 
import { observer } from "mobx-react";
import { socket, setupSocket } from "./setupSocket";

setupState();
setupSocket();
state.sendMessage = (action: IAction) => {
    socket.send(JSON.stringify(action));
};

window.onpopstate = (e) => {
    state.page.set(e.state as State.IPage);
};

function never(n: never, message: string) {
    console.error(message);
}

export const MainPage = observer(()=>{
    const p = state.page.current;
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
            return <div><Object type={p.objectType} id={p.id} version={p.version} /> </div>
        case State.PAGE_TYPE.Deployment:
            return <Deployment />
        case State.PAGE_TYPE.DeploymentDetails:
            return <div><DeploymentDetails index={p.index} /></div>
        default:
            never(p, "Unhandled page type");
    }
});

const Content = observer(()=>{
    let dialog: JSX.Element = null;
    if (state.connectionStatus != CONNECTION_STATUS.INITED) {
        dialog = <Login />;
    }
    if (state.loaded) {
        return (<>
            <Menu/>
            <main>
                <MainPage />
            </main>
         </>)
    } else {
        return dialog;
    }
});

ReactDOM.render(
    <MuiThemeProvider theme={theme}>
        <Content />
    </MuiThemeProvider>
    , document.getElementById("main"));
