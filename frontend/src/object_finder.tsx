import * as React from "react";
import {ClearAutoComplete} from './clear_auto_complete';
import {INameIdPair} from '../../shared/state'
import {IMainState} from './reducers';
import {connect} from 'react-redux'
import {Dispatch} from 'redux'
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import * as page from './page'


interface StateProps {
    objectNamesAndIds: {[cls:string]:INameIdPair[]};
}

interface DispatchProps {
    displayObject(id:number, cls:string):void;
}

function mapStateToProps(s:IMainState, p: {}): StateProps {
    return {objectNamesAndIds: s.objectNamesAndIds};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        displayObject: (id: number, cls:string) => {
            page.setPage({
                type: State.PAGE_TYPE.Object,
                class: cls,
                id
            }, dispatch);
        }
    }    
}

export function ObjectFinderImpl(props:StateProps & DispatchProps) {
    type Item = {label:string, key:number, cls:string};
    let all: Item[] = [];
    for (let cls in props.objectNamesAndIds) {
        let ps = props.objectNamesAndIds[cls];
        for (let p of ps) {
            let item: Item = {label: p.name + " (" + cls + ")", key: p.id, cls: cls};
            all.push(item);
        }
    }

    return (
        <ClearAutoComplete
                hintText="Search"
                dataSource={all}
                dataSourceConfig={{text:"label",value:"key"}}
                onNewRequest={(item:Item)=>{props.displayObject(item.key, item.cls)}}
                />
    )
}

export const ObjectFinder = connect(mapStateToProps, mapDispatchToProps)(ObjectFinderImpl);