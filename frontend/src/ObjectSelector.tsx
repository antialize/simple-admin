import {observer} from "mobx-react";
import state from "./state";
import {Autocomplete, TextField} from "@mui/material";

interface IProps {
    selected: number[];
    setSelected: (selected: number[]) => void;
    filter: (type: number, id: number) => boolean;
}

const ObjectSelector = observer(function ObjectSelector(p: IProps) {
    const sel: Record<number, boolean> = {};
    for (const s of p.selected) sel[s] = true;
    interface Item {
        label: string;
        value: number;
    }
    const all: Item[] = [];
    const selected: Item[] = [];
    for (const [type, ps] of state.objectDigests) {
        for (const [id, ct] of ps) {
            if (!p.filter(ct.type, id)) continue;
            const t = state.types?.get(ct.type);
            const item: Item = {label: ct.name + " (" + (t ? t.name : +type) + ")", value: id};
            all.push(item);
            if (id in sel) selected.push(item);
        }
    }

    return (
        <Autocomplete
            options={all}
            disableClearable
            multiple
            fullWidth
            renderInput={params => (
                <TextField {...params} variant="standard" placeholder="Select objects" />
            )}
            value={selected}
            onChange={(_, values) => {
                p.setSelected(values.map(i => i.value));
            }}
        />
    );
});

export default ObjectSelector;
