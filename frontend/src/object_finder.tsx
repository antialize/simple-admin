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


interface StateProps {
    objectDigests: {[type:number]:IObjectDigest[]};
    types: {[id:number]:IObject2<IType>};
}

interface DispatchProps {
    displayObject(id:number, type:number):void;
}

function mapStateToProps(s:IMainState, p: {}): StateProps {
    return {objectDigests: s.objectDigests, types: s.types};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        displayObject: (id: number, type:number) => {
            page.setPage({
                type: State.PAGE_TYPE.Object,
                objectType: type,
                id
            }, dispatch);
        }
    }    
}

export function ObjectFinderImpl(props:StateProps & DispatchProps) {
    type Item = {label:string, key:number, type:number};
    let all: Item[] = [];
    for (let type_ in props.objectDigests) {
        let type = +type_;
        let ti = props.types[type];
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
                onNewRequest={(item:Item)=>{props.displayObject(item.key, item.type)}}
                />
    )
}

export const ObjectFinder = connect(mapStateToProps, mapDispatchToProps)(ObjectFinderImpl);