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
import nullCheck from '../../shared/nullCheck';

const ObjectList = observer(function ObjectList({type}:{type:number}) {
    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;
    let filter = (state.objectListFilter.get(type) || "");
    let lst = [];
    const digests = state.objectDigests.get(type);
    if (digests !== undefined) {
        for (let [i, v] of digests) {
            if (v.name.toLowerCase().includes(filter.toLowerCase()))
                lst.push(v);
        }
        lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    }
    return <>
            <Typography variant="h5" component="h3">
                List of {nullCheck(state.types.get(type)).content.plural}
            </Typography>
            <TextField placeholder="Filter" onChange={(e)=>{state.objectListFilter.set(type,e.target.value);}} value={filter}/>
            <List>
                {lst.map(v => 
                    <ListItem
                        key={v.id}
                        onClick={(e)=>page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id})}
                        >
                        <Link color={"textPrimary" as any}>{v.name}</Link>
                    </ListItem>)}
            </List>
            <Button variant="contained" onClick={(e)=>page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type})} href={page.link({type:State.PAGE_TYPE.Object, objectType: type})}>Add new</Button>
        </>;
});

export default ObjectList;

