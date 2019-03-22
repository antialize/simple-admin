import * as React from "react";
//import AutoComplete from 'material-ui/AutoComplete';
import { observer } from "mobx-react";
import state from "./state";

export default observer(({catagory, type, setCatagory}:{catagory:string, type:number, setCatagory: (catagory:string) => void}) => {
    let catagories = new Set();
    if (state.objectDigests.has(type))
        for (const [key, val] of state.objectDigests.get(type))
            catagories.add(val.catagory);
    let cat2 = [];
    for (const cat of catagories)
        cat2.push(cat);
    return <div />;
   /* return <AutoComplete
            searchText={catagory || ""}
            filter={AutoComplete.caseInsensitiveFilter}
            onUpdateInput={setCatagory}
            hintText="Catagory"
            dataSource={cat2}
            />;*/
});
