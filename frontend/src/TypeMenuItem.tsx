import * as React from "react";
import * as State from '../../shared/state';
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import Menu from '@material-ui/core/Menu';
import MenuItem from "@material-ui/core/MenuItem";
import state from "./state";
import { observer } from "mobx-react";
import { rootInstanceId, rootId } from '../../shared/type';
import { useState } from "react";

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

export const ObjectMenuList = observer(function ObjectMenuList({type}:{type:number}) {
    let lst = [];
    if (state.objectDigests.has(type)) {
        for (let [i, v] of state.objectDigests.get(type)) {
            lst.push(v);
        }
        lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    }
    return (
        <>
            <MenuItem
                key="new"
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}
                href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}>
                new
            </MenuItem>
            <MenuItem
                key="list"
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType: type})}
                href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType: type})}>
                list
            </MenuItem>
            <Divider/>
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

const TypeMenuItem = observer(function TypeMenuItem({id}:{id:number}) {
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

export default TypeMenuItem;

