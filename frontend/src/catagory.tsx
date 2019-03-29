import * as React from "react";
//import AutoComplete from 'material-ui/AutoComplete';
import { observer } from "mobx-react";
import state from "./state";
import Select from "./select";


export default observer(({catagory, type, setCatagory}:{catagory:string, type:number, setCatagory: (catagory:string) => void}) => {
    let catagories = new Set();
    if (state.objectDigests.has(type))
        for (const [key, val] of state.objectDigests.get(type))
            catagories.add(val.catagory)
    let cat2 = [];
    for (const cat of catagories) {
        cat2.push({value:cat, label:cat});
    }
    return <Select
        placeholder="Catagory"
        create
        options={cat2}
        value={{value:catagory, label:catagory}}
        onChange={(value)=>setCatagory((value as any).value)}
        />;


});
