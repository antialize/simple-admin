import * as React from "react";
import * as State from '../../shared/state'
import ObjectFinder from './object_finder'
import { hostId} from '../../shared/type'
import {debugStyle} from './debug';
import TypeMenuItem from './typeMenuItem';
import HostTypeMenuItem from './hostTypeMenuItem';
import state from "./state";
import { observer } from "mobx-react";
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Divider from '@material-ui/core/Divider';

export default observer(()=>{
    const types = state.menuTypes;
    return (<Drawer open={true} style={debugStyle()} variant="persistent" anchor="left">
        <div>
            <Button variant="contained" onClick={()=>state.login.logout(false)}>Logout</Button>
            <Button variant="contained" onClick={()=>state.login.logout(true)}>Full logout</Button>
        </div>
        <List style={debugStyle()}>
            <ListItem button><ObjectFinder /></ListItem>
            <Divider/>
            <ListItem button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}>Dashbord</ListItem>
            <Divider/>
            <ListItem button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}>Deployment</ListItem>
            <Divider/>
            {types.map(t => t.id==hostId?<HostTypeMenuItem key={t.id}/>: <TypeMenuItem key={t.id} id={t.id} />)}
        </List>
    </Drawer>);
});
