import { Autocomplete, TextField } from "@mui/material";
import { observer } from "mobx-react";
import state from "./state";

const Category = observer(function Category({
    category,
    type,
    setCategory,
}: {
    category: string;
    type: number;
    setCategory: (category: string) => void;
}) {
    const catagories = new Set<string>();
    const digests = state.objectDigests.get(type);
    if (digests) for (const [_, val] of digests) catagories.add(val.category);
    const cat2 = [];
    for (const cat of catagories) {
        cat2.push(cat);
    }
    return (
        <Autocomplete
            options={cat2}
            freeSolo
            renderInput={(params) => {
                return <TextField {...params} placeholder="Category" variant="standard" />;
            }}
            value={category}
            onChange={(_, value) => {
                value && setCategory(value);
            }}
        />
    );
});

export default Category;
