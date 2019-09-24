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
import {HotKeyPortal} from "./HotKey"
import nullCheck from '../../shared/nullCheck';

setupState();
setupSocket();
state.doSendMessage = (action: IAction) => {
    nullCheck(socket).send(JSON.stringify(action));
};

window.onpopstate = (e) => {
    nullCheck(state.page).set(e.state as State.IPage);
};

const Content = observer(function Content () {
    let dialog: JSX.Element | null = null;
    if (state.connectionStatus != CONNECTION_STATUS.INITED) {
        dialog = <Login />;
    }
    if (state.loaded) {
        return <HotKeyPortal
                hotkeys={{
                    'search': ['/', 's'],
                    'dashbord': 'd',
                    'images': 'i',
                    'containers': 'c',
                    'menu': 'm'
                }} >
                <Menu/>
                <main>
                    <MainPage />
                </main>
            </HotKeyPortal>;
    } else {
        return dialog;
    }
});

ReactDOM.render(
    <MuiThemeProvider theme={theme}>
        <Content />
    </MuiThemeProvider>
    , document.getElementById("main"));
