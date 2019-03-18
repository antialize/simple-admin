import * as React from "react";
import Chip from 'material-ui/Chip';
import {ClearAutoComplete} from './clear_auto_complete';

import {IObjectDigest, IObject2} from '../../shared/state'
import {IMainState} from './reducers';
import {connect} from 'react-redux'
import { observer } from "mobx-react";
import state from "./state";

interface IProps {
    selected: number[];
    setSelected(selected: number[]): void;
    filter(type:number, id:number): boolean;
}

interface StateProps {
    objectDigests: {[type:number]:IObjectDigest[]};
    p: IProps;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    return {objectDigests: s.objectDigests, p};
}

const ObjectSelectorImpl = observer((props:StateProps) => {
    let sel:{[key:number]:boolean} = {};    
    for (let s of props.p.selected)
        sel[s] = true;
    type Item = {label:string, key:number};
    let all: Item[] = [];
    let selected: Item[] = [];
    for (let type in props.objectDigests) {
        let ps = props.objectDigests[type];
        for (let p of ps) {
            if (!props.p.filter(p.type, p.id)) continue;
            let item: Item = {label: p.name + " (" + ((state.types && state.types.has(p.type) && state.types.get(p.type).name) || +type) + ")", key: p.id};
            all.push(item);
            if (p.id in sel) selected.push(item);
        }
    }

    return (
        <div>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
                {selected.map((o)=>{
                    return <Chip key={o.key} style={{margin:4}} onRequestDelete={()=>{
                        props.p.setSelected(props.p.selected.filter((id)=>id != o.key))
                        }}>{o.label}</Chip>
                })}
            </div>
            <ClearAutoComplete
                    hintText="Add"
                    dataSource={all}
                    dataSourceConfig={{text:"label",value:"key"}}
                    onNewRequest={(item:Item)=>{props.p.setSelected(props.p.selected.concat([item.key])); return "";}}
                    />
        </div>
    )
});

export const ObjectSelector = connect(mapStateToProps)(ObjectSelectorImpl);
