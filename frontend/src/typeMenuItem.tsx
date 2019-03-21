import * as React from "react";
import * as State from '../../shared/state'
import {rootInstanceId, rootId} from '../../shared/type'
import state from "./state";
import { observer } from "mobx-react";
import ListItem from '@material-ui/core/ListItem';
import Button from "@material-ui/core/Button";

import Grow from '@material-ui/core/Grow';
import Popper from '@material-ui/core/Popper';
import ClickAwayListener from '@material-ui/core/ClickAwayListener';
import { useState } from "react";
import Paper from "@material-ui/core/Paper";
import MenuList from "@material-ui/core/MenuList";
import MenuItem from "@material-ui/core/MenuItem";

import Menu from '@material-ui/core/Menu';


function DropDown({title, children}:{title:string, children:any}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    return <>
        <Button
            aria-owns={open ? 'render-props-menu' : undefined}
            aria-haspopup="true"
            onClick={event => {setAnchor(event.currentTarget); setOpen(true)}}
            >
            {title}
        </Button>
        <Menu id="render-props-menu" anchorEl={anchor} open={open} onClose={()=>setOpen(false)} anchorOrigin={{vertical:'bottom', horizontal: 'left'}} transformOrigin={{vertical: "top", horizontal: "left"}}>
            {children}
        </Menu>
    </>;
}

const ObjectMenuList = observer(({type}:{type:number})=>{
    let lst = [];
    if (state.objectDigests.has(type)) {
        for (let [i, v] of state.objectDigests.get(type)) {
            lst.push(v);
        }
        lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    }
    console.log("HI", lst.length);
    return (
        <>
            {lst.map(v=>
             <MenuItem
                key={v.id}
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}
                href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}>
                {v.name}
            </MenuItem>
            )}
        </>
        );
});


export default observer(({id}:{id:number})=>{
    const name = state.types.get(id).name;
    if (id == rootId) {
        return <Button 
           key={rootInstanceId}
           onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
           href={state.page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}>{name}</Button>;
   }
   return <DropDown title={name}>
        <ObjectMenuList type={id} />
   </DropDown>;

 /*  return <Button 
    key={id}
    onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType:id})}
    href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType:id})}>{name}</Button>;*/
});

