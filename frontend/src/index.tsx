import * as React from "react";
import * as ReactDOM from "react-dom";
//import * as XTerm from 'xterm'
import { Store, createStore } from 'redux';
import { Provider, connect} from 'react-redux';
import { mainReducer, IMainState } from './reducers'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'; 
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import * as injectTapEventPlugin from 'react-tap-event-plugin'
import {SStatuses} from './status'
import {IAction} from '../../shared/actions'
injectTapEventPlugin();

//import { persistState, D } from 'redux-devtools';
//import { DevTools, DebugPanel, LogMonitor } from 'redux-devtools/lib/react';
//let t = new XTerm();
//t.open(document.getElementById("main"));
//t.write('Hello from \033[1;3;31mxterm.js\033[0m $ ');

let store = createStore(mainReducer) as Store<IMainState>;

let socket = new WebSocket('ws://127.0.0.1:8000', 'sysadmin');

socket.onmessage = (data=>{
    let d = JSON.parse(data.data) as IAction;
    store.dispatch(d);
});

ReactDOM.render(
    <div>
        <MuiThemeProvider> 
            <Provider store={store}>
                <div>
                    <div>Hello world 2</div>
                    <SStatuses />
                </div>
            </Provider>
        </MuiThemeProvider>
    </div>,document.getElementById("main") );
