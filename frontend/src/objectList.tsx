import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import * as State from '../../shared/state'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import state from "./state";
import { observer } from "mobx-react";

export default observer(({type}:{type:number}) => {
    let filter = (state.objectListFilter.get(type) || "");
    let lst = [];
    if (state.objectDigests.has(type)) {
        for (let [i, v] of state.objectDigests.get(type)) {
            if (v.name.toLowerCase().includes(filter.toLowerCase()))
                lst.push(v);
        }
        lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    }
    return (
            <div>
                <TextField floatingLabelText="Filter" onChange={(a, v)=>{state.objectListFilter.set(type,v);}} value={filter}/>
                <List>
                    {lst.map(v => <ListItem primaryText={v.name} key={v.id} onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}/>)}
                </List>
                <RaisedButton label="Add new" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})} />
            </div>
        );
});

