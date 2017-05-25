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
import {Messages} from './messages';
import {remoteHost} from './config';
import {Deployment} from './deployment';
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
        return <div>
            <h1>Dashboard</h1>
            <Messages />
            <Statuses />
        </div>;
    case State.PAGE_TYPE.ObjectList:
        return <div><h1>List of {p.class}</h1><ObjectList class={p.class} /></div>
    case State.PAGE_TYPE.Object:
        return <div><Object class={p.class} id={p.id} version={p.version} /> </div>
    case State.PAGE_TYPE.Deployment:
        return <div><Deployment /></div>
    }
}

export let MainPage = connect(mapStateToProps)(MainPageImpl);

export interface ActionTarget {
    handle: (action:IAction) => boolean;
}

const actionTargets: {[action:number]: ActionTarget[]} = {};

export function addActionTarget(action:ACTION, target:ActionTarget) {
    if (!(action in actionTargets)) actionTargets[action] = [];
    actionTargets[action].push(target);
}
 
export function removeActionTarget(action:ACTION, target:ActionTarget) {
    actionTargets[action] =  actionTargets[action].filter((t)=>t !== target);
}

export function sendMessage(action:IAction) {
    socket.send(JSON.stringify(action));
}

const handleRemote = (store:Store<IMainState>) => (next:(a:IAction)=>any) => (action:IAction) => { 
    switch(action.type) {
    case ACTION.SetPage:
        switch (action.page.type) {
        case State.PAGE_TYPE.Object:
            const objects = store.getState().objects;
            if (! (action.page.id in objects) || !(1 in objects[action.page.id].versions)) {
                let a: IFetchObject = {
                    type: ACTION.FetchObject,
                    id: action.page.id
                };
                sendMessage(a);
            }
            break;
        }
        break;
    case ACTION.SaveObject:
        action.obj = store.getState().objects[action.id].current
        sendMessage(action);
        break;
    case ACTION.DeployObject:
    case ACTION.StopDeployment:
    case ACTION.StartDeployment:
    case ACTION.CancelDeployment:
    case ACTION.PokeService:   
        sendMessage(action);
        return;
    case ACTION.ToggleDeploymentObject:
        if (action.source == "webclient") {
            sendMessage(action);
            return;
        }
        break;
    case ACTION.SetMessageDismissed:
        if (action.source == "webclient") {
            sendMessage(action);
            return;
        }
    }
    return next(action);
}
    

let store = createStore(mainReducer, applyMiddleware(handleRemote)) as Store<IMainState>;

let socket = new WebSocket('wss://'+remoteHost+'/sysadmin');

socket.onmessage = (data=>{
    let d = JSON.parse(data.data) as IAction;
    if (d.type in actionTargets) {
        for (const t of actionTargets[d.type])
            if (t.handle(d)) 
                return;
    }
    store.dispatch(d);
    switch (d.type) {
    case ACTION.SetInitialState:
        console.log("Set initial state");
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
