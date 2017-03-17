import * as React from "react";
import * as ReactDOM from "react-dom";
import { Store, createStore, applyMiddleware} from 'redux';
import { Provider, connect} from 'react-redux';
import { mainReducer, IMainState } from './reducers'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'; 
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import * as injectTapEventPlugin from 'react-tap-event-plugin'
import {Statuses} from './status'
import * as State from '../../shared/state';
import {IAction, ACTION, IFetchObject} from '../../shared/actions'
import * as $ from "jquery";
import * as page from './page'

import {Object} from './object'
import {Menu} from './menu'
import {ObjectList} from './objectList'
import CircularProgress from 'material-ui/CircularProgress';


injectTapEventPlugin();

interface Props {
    page: State.IPage;
}

function mapStateToProps(s:IMainState) {
    return {page: s.page}
}

function MainPageImpl(props: Props) {
    const p = props.page;
    switch (p.type) {
    case State.PAGE_TYPE.Dashbord:
        return <div><h1>Dashboard</h1><Statuses /></div>;
    case State.PAGE_TYPE.ObjectList:
        return <div><h1>List of {p.class}</h1><ObjectList class={p.class} /></div>
    case State.PAGE_TYPE.Object:
        return <div><h1>Object</h1><Object class={p.class} id={p.id} version={p.version} /> </div>
    }
}

export let MainPage = connect(mapStateToProps)(MainPageImpl);

const handleRemote = (store:Store<IMainState>) => (next:(a:IAction)=>any) => (action:IAction) => { 
    switch(action.type) {
    case ACTION.SetPage:
        switch (action.page.type) {
        case State.PAGE_TYPE.Object:
            const objects = store.getState().objects;
            if (! (action.page.id in objects)) {
                let a: IFetchObject = {
                    type: ACTION.FetchObject,
                    id: action.page.id
                };
                socket.send(JSON.stringify(a));
            }
            break;
        }
        break;
    }
    return next(action);
}
    


//import { persistState, D } from 'redux-devtools';
//import { DevTools, DebugPanel, LogMonitor } from 'redux-devtools/lib/react';
//let t = new XTerm();
//t.open(document.getElementById("main"));
//t.write('Hello from \033[1;3;31mxterm.js\033[0m $ ');

let store = createStore(mainReducer, applyMiddleware(handleRemote)) as Store<IMainState>;

let socket = new WebSocket('wss://127.0.0.1:8001/sysadmin');

socket.onmessage = (data=>{
    let d = JSON.parse(data.data) as IAction;
    store.dispatch(d);
    switch (d.type) {
    case ACTION.SetInitialState:
        console.log("SetInitialState");
        store.dispatch({
            type: ACTION.SetPage,
            page: page.get()})
        break
    }
});

window.onpopstate = (e) => {
    let page = e.state as State.IPage;
    store.dispatch({
        type: ACTION.SetPage,
        page: page
    });
};

interface PropsC {
    loaded: boolean;
}


function ContentImpl(p:PropsC) {
    if (!p.loaded) {
        return <CircularProgress />
    } else {
        return (<div>
            <Menu />
            <div style={{marginLeft: "300px"}}>
                <MainPage />
            </div>
        </div>)
    }
}

function mapStateToPropsC(state:IMainState): PropsC {
    return {loaded: state.loaded}
}

export let Content = connect(mapStateToPropsC)(ContentImpl);

ReactDOM.render(
    <div>
        <MuiThemeProvider> 
            <Provider store={store}>
                <Content />
            </Provider>
        </MuiThemeProvider>
    </div>,document.getElementById("main") );
/*
let terminalContainer = document.getElementById('terminal');
let term = new Terminal({cursorBlink: true, scrollback: 10000});
term.open(terminalContainer);
term.on('resize', function (size:any) {console.log(size.cols, size.rows);})

let s = new WebSocket('ws://127.0.0.1:8000/terminal?server=cookie&cols=80&rows=50');
s.onopen = ()=>{
    term.attach(s);
    term._initialized = true;
}*/




//term.fit();
 // var initialGeometry = term.proposeGeometry(),
  //    cols = initialGeometry.cols,
  //    rows = initialGeometry.rows;


