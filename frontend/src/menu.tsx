import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import Drawer from 'material-ui/Drawer';
import Divider from 'material-ui/Divider';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as page from './page'
import {ObjectFinder} from './object_finder'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'
import {debugStyle} from './debug';
import { createSelector } from 'reselect';
import {TypeMenuItem} from './typeMenuItem';
import {HostTypeMenuItem} from './hostTypeMenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import state from "./state";


interface Props {
    types: {id:number, name:string}[];
}

const getTypes = (state:IMainState) => state.types;

const mapStateToProps = createSelector([getTypes], (types) => {
    const ans: {id:number, name:string}[] = [];
    for (const key in types) {
        const type = types[key];
        if (type.content.kind == "trigger") continue;
        ans.push({id: type.id, name: type.content.plural});
    }
    ans.sort((l, r)=>{
        if (l.id == hostId) return -1;
        if (r.id == hostId) return 1;
        if (l.id == typeId) return 1;
        if (r.id == typeId) return -1;
        return l.name < r.name?-1:1
    })
    return {types: ans};
});


function MenuImpl(props:Props) {
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
            {props.types.map(t => t.id==hostId?<HostTypeMenuItem key={t.id}/>: <TypeMenuItem key={t.id} id={t.id} />)}
        </List>
    </Drawer>);
}

export let Menu = connect(mapStateToProps)(MenuImpl);
