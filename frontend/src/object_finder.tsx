import * as React from "react";
import {ClearAutoComplete} from './clear_auto_complete';
import * as State from '../../shared/state'
import state from "./state";
import { observer } from "mobx-react";

export default observer(() => {
    type Item = {label:string, key:number, type:number};
    let all: Item[] = [];
    for (let [type, ps] of state.objectDigests) {
        let ti = state.types.get(type);
        for (let [id, p] of ps) {
            if (!ti) continue;
            let item: Item = {label: p.name + " (" + ti.name + ")", key: p.id, type: type};
            all.push(item);
        }
    }

    return (
        <ClearAutoComplete
                hintText="Search"
                dataSource={all}
                dataSourceConfig={{text:"label",value:"key"}}
                onNewRequest={(item:Item)=>{
                    state.page.set({
                        type: State.PAGE_TYPE.Object,
                        objectType: item.type,
                        id: item.key
                    })
                }}
                />
    )
});

