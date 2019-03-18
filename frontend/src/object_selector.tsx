import * as React from "react";
import Chip from 'material-ui/Chip';
import {ClearAutoComplete} from './clear_auto_complete';
import { observer } from "mobx-react";
import state from "./state";

interface IProps {
    selected: number[];
    setSelected(selected: number[]): void;
    filter(type:number, id:number): boolean;
}
export default observer((p:IProps) => {
    let sel:{[key:number]:boolean} = {};    
    for (let s of p.selected)
        sel[s] = true;
    type Item = {label:string, key:number};
    let all: Item[] = [];
    let selected: Item[] = [];
    for (let [type, ps] of state.objectDigests) {
        for (let [id, ct] of ps) {
            if (!p.filter(ct.type, id)) continue;
            let item: Item = {label: ct.name + " (" + ((state.types && state.types.has(ct.type) && state.types.get(ct.type).name) || +type) + ")", key: id};
            all.push(item);
            if (id in sel) selected.push(item);
        }
    }

    return (
        <div>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
                {selected.map((o)=>{
                    return <Chip key={o.key} style={{margin:4}} onRequestDelete={()=>{
                        p.setSelected(p.selected.filter((id)=>id != o.key))
                        }}>{o.label}</Chip>
                })}
            </div>
            <ClearAutoComplete
                    hintText="Add"
                    dataSource={all}
                    dataSourceConfig={{text:"label",value:"key"}}
                    onNewRequest={(item:Item)=>{p.setSelected(p.selected.concat([item.key])); return "";}}
                    />
        </div>
    )
});
