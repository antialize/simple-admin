import * as React from "react";
import {ClearAutoComplete} from './clear_auto_complete';
import {IObjectDigest, IObject2} from '../../shared/state'
import {IType} from '../../shared/type'
import {IMainState} from './reducers';
import {connect} from 'react-redux'
import {Dispatch} from 'redux'
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import * as page from './page'
import state from "./state";
import { observer } from "mobx-react";


interface StateProps {
    objectDigests: {[type:number]:IObjectDigest[]};
}

function mapStateToProps(s:IMainState, p: {}): StateProps {
    return {objectDigests: s.objectDigests};
}

const ObjectFinderImpl = observer((props:StateProps) => {
    type Item = {label:string, key:number, type:number};
    let all: Item[] = [];
    for (let type_ in props.objectDigests) {
        let type = +type_;
        let ti = state.types.get(type);
        let ps = props.objectDigests[type_];
        for (let p of ps) {
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

export const ObjectFinder = connect(mapStateToProps)(ObjectFinderImpl);
