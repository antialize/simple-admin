import * as React from "react";
import * as State from '../../shared/state'
import state from "./state";
import { observer } from "mobx-react";
import TextField from "@material-ui/core/TextField";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import Button from "@material-ui/core/Button";

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
                <TextField placeholder="Filter" onChange={(e)=>{state.objectListFilter.set(type,e.target.value);}} value={filter}/>
                <List>
                    {lst.map(v => 
                        <ListItem
                            key={v.id}
                            onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}
                            href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}>
                            {v.name}
                        </ListItem>)}
                </List>
                <Button variant="contained" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}>Add new</Button>
            </div>
        );
});

