import * as React from "react";
import Select from "./Select";
import state from "./state";
import { observer } from "mobx-react";

const Category = observer(function Category({category, type, setCategory}:{category:string, type:number, setCategory: (category:string) => void}) {
    let catagories = new Set();
    if (state.objectDigests.has(type))
        for (const [key, val] of state.objectDigests.get(type))
            catagories.add(val.category)
    let cat2 = [];
    for (const cat of catagories) {
        cat2.push({value:cat, label:cat});
    }
    return <Select
        placeholder="Category"
        create
        options={cat2}
        value={{value:category, label:category}}
        onChange={(value)=>setCategory((value as any).value)}
        />;
});

export default Category;
