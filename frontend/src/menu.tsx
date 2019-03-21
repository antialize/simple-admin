import * as React from "react";
import * as State from '../../shared/state'
import ObjectFinder from './object_finder'
import { hostId, userId} from '../../shared/type'
import TypeMenuItem from './typeMenuItem';
import HostTypeMenuItem from './hostTypeMenuItem';
import state from "./state";
import { observer } from "mobx-react";
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Divider from '@material-ui/core/Divider';
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
/*
<List>
<ListItem button><ObjectFinder /></ListItem>
<Divider/>
<ListItem button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}>Dashbord</ListItem>
<Divider/>
<ListItem button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}>Deployment</ListItem>
<Divider/>
{types.map(t => t.id==hostId?<HostTypeMenuItem key={t.id}/>: <TypeMenuItem key={t.id} id={t.id} />)}
</List>
*/
export default observer(()=>{
    const types = state.menuTypes;
    return (
        <AppBar position="static">
            <Toolbar>
                <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}>Dashbord</Button>
                <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}>Deployment</Button>
                <div style={{width: "10px"}} />
                <TypeMenuItem key={hostId} id={hostId} />
                <TypeMenuItem key={userId} id={userId} />

                <div style={{flexGrow: 1}} />
                <Button onClick={()=>state.login.logout(false)}>Logout</Button>
                <Button onClick={()=>state.login.logout(true)}>Full logout</Button>
            </Toolbar>
    </AppBar>);
});
