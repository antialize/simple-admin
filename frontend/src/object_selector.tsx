import * as React from "react";
import { observer } from "mobx-react";
import state from "./state";
import Select from "./select";

interface IProps {
    selected: number[];
    setSelected(selected: number[]): void;
    filter(type:number, id:number): boolean;
}
export default observer((p:IProps) => {
    let sel:{[key:number]:boolean} = {};    
    for (let s of p.selected)
        sel[s] = true;
    type Item = {label:string, value:number};
    let all: Item[] = [];
    let selected: Item[] = [];
    for (let [type, ps] of state.objectDigests) {
        for (let [id, ct] of ps) {
            if (!p.filter(ct.type, id)) continue;
            let item: Item = {label: ct.name + " (" + ((state.types && state.types.has(ct.type) && state.types.get(ct.type).name) || +type) + ")", value: id};
            all.push(item);
            if (id in sel) selected.push(item);
        }
    }

    return (
        <Select
            isMulti
            options={all}
            value={selected}
            onChange={(value: Item[]) => p.setSelected(value.map(i=>i.value))}
            placeholder="Select objects"
            />
    )
});
