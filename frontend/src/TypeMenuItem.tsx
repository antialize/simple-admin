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
import MenuDropdown, { DropDownItem } from "./MenuDropdown";

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
            <DropDownItem
                key="new"
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}
                href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: null, version:null})}>
                new
            </DropDownItem>
            <DropDownItem
                key="list"
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ObjectList, objectType: type})}
                href={state.page.link({type:State.PAGE_TYPE.ObjectList, objectType: type})}>
                list
            </DropDownItem>
            <DropDownItem/>
            {lst.map(v=>
             <DropDownItem
                key={v.id}
                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}
                href={state.page.link({type:State.PAGE_TYPE.Object, objectType: type, id: v.id, version:null})}>
                {v.name}
            </DropDownItem>
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
   return <MenuDropdown title={name}>
        <ObjectMenuList type={id} />
   </MenuDropdown>;
});

export default TypeMenuItem;

