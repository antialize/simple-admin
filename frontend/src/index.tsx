import * as React from "react";
import * as ReactDOM from "react-dom";
import Login from './Login';
import Menu from './Menu';
import setupState from './setupState';
import state, { CONNECTION_STATUS } from "./state";
import theme from "./theme";
import { IAction } from '../../shared/actions';
import { MuiThemeProvider } from '@material-ui/core/styles'; 
import { observer } from "mobx-react";
import { socket, setupSocket } from "./setupSocket";
import { MainPage } from "./MainPage";
import * as State from '../../shared/state';

setupState();
setupSocket();
state.sendMessage = (action: IAction) => {
    socket.send(JSON.stringify(action));
};

window.onpopstate = (e) => {
    state.page.set(e.state as State.IPage);
};

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
