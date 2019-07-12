import * as React from "react";
import Select from "./Select";
import state from "./state";
import { observer } from "mobx-react";
import { rootId } from "../../shared/type";

interface IProps {
    selected: number[];
    setSelected(selected: number[]): void;
    filter(type:number, id:number): boolean;
}

const ObjectSelector = observer(function ObjectSelector(p:IProps) {
    const sel:{[key:number]:boolean} = {};
    for (const s of p.selected)
        sel[s] = true;
    type Item = {label:string, value:number};
    const all: Item[] = [];
    const selected: Item[] = [];
    for (let [type, ps] of state.objectDigests) {
        for (let [id, ct] of ps) {
            if (!p.filter(ct.type, id)) continue;
            const t = state.types && state.types.get(ct.type);
            const item: Item = {label: ct.name + " (" + (t? t.name : +type) + ")", value: id};
            all.push(item);
            if (id in sel) selected.push(item);
        }
    }

    return (
        <Select
            type='multi'
            fullWidth
            options={all}
            value={selected}
            onChange={(value) => p.setSelected((value as Item[]).map(i=>i.value))}
            placeholder="Select objects"
            />
    )
});

export default ObjectSelector;
