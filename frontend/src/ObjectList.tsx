import * as React from "react";
import * as State from '../../shared/state'
import Button from "@material-ui/core/Button";
import Link from "@material-ui/core/Link";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import TextField from "@material-ui/core/TextField";
import Typography from '@material-ui/core/Typography';
import state from "./state";
import { observer } from "mobx-react";

const ObjectList = observer(({type}:{type:number}) => {
    let filter = (state.objectListFilter.get(type) || "");
    let lst = [];
    if (state.objectDigests.has(type)) {
        for (let [i, v] of state.objectDigests.get(type)) {
            if (v.name.toLowerCase().includes(filter.toLowerCase()))
                lst.push(v);
        }
        lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    }
    return <>
            <Typography variant="h5" component="h3">
                List of {state.types.get(type).content.plural}
            </Typography>
            <TextField placeholder="Filter" onChange={(e)=>{state.objectListFilter.set(type,e.target.value);}} value={filter}/>
            <List>
                {lst.map(v => 
                    <ListItem
                        key={v.id}
                        onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}
                        href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}>
                        <Link color={"textPrimary" as any}>{v.name}</Link>
                    </ListItem>)}
            </List>
            <Button variant="contained" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}>Add new</Button>
        </>;
});

export default ObjectList;

