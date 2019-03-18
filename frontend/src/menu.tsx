import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import Drawer from 'material-ui/Drawer';
import Divider from 'material-ui/Divider';
import * as State from '../../shared/state'
import ObjectFinder from './object_finder'
import { hostId} from '../../shared/type'
import {debugStyle} from './debug';
import TypeMenuItem from './typeMenuItem';
import HostTypeMenuItem from './hostTypeMenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import state from "./state";
import { observer } from "mobx-react";

export default observer(()=>{
    const types = state.menuTypes;
    return (<Drawer open={true} style={debugStyle()}>
        <RaisedButton label="Logout" onClick={()=>state.login.logout(false)}/>
        <RaisedButton label="Full logout" onClick={()=>state.login.logout(true)} />
        <List style={debugStyle()}>
            <ListItem primaryText={<ObjectFinder />} />
            <Divider/>
            <ListItem primaryText="Dashbord" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}></ListItem>
            <Divider/>
            <ListItem primaryText="Deployment" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}/>
            <Divider/>
            {types.map(t => t.id==hostId?<HostTypeMenuItem key={t.id}/>: <TypeMenuItem key={t.id} id={t.id} />)}
        </List>
    </Drawer>);
});
