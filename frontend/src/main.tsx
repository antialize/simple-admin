import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { ThemeProvider, createTheme } from "@mui/material";
import App from "./App.tsx";
import nullCheck from "./nullCheck.ts";
import { setupSocket, socket } from "./setupSocket.ts";
import setupState from "./setupState.ts";
import state from "./state.ts";

import "./style.css";
import "@xterm/xterm/css/xterm.css";
import type { IClientAction, IPage } from "./shared_types.ts";

setupState();
setupSocket();
state.doSendMessage = (action: IClientAction) => {
    nullCheck(socket).send(JSON.stringify(action));
};

window.onpopstate = (e: PopStateEvent) => {
    nullCheck(state.page).set(e.state as IPage);
};

const theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: "#3f51b5",
        },
        secondary: {
            main: "#f50057",
        },
        background: {
            paper: "#202020",
        },
    },
});

document.body.style.backgroundColor = theme.palette.background.default;

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <App />
        </ThemeProvider>
    </React.StrictMode>,
);
