import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import * as page from './page'
import state from "./state";

interface IProps {
    type: number;
}

interface Props {
    objects: State.IObjectDigest[];
    filter: string;
    type: number;
    setFilter(filter:string):void;
}

function mapStateToProps(s:IMainState, o:IProps) {
    let lst = (o.type in s.objectDigests ? s.objectDigests[o.type] : []);
    let filt = (o.type in s.objectListFilter ? s.objectListFilter[o.type] : "");
    lst = lst.filter((st)=>st.name.toUpperCase().includes(filt.toUpperCase()));
    lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    return {
        objects:  lst,
        filter: filt,
        type: o.type
    }
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:IProps) {
    return {
        setFilter: (filter:string) => {
            const p:Actions.ISetObjectListFilter = {
                type: Actions.ACTION.SetObjectListFilter,
                filter: filter,
                objectType: o.type
            };
            dispatch(p);
        },

    }
}

function ObjectListImpl(props:Props) {
    return (
            <div>
                <TextField floatingLabelText="Filter" onChange={(a, v)=>{props.setFilter(v);}} value={props.filter}/>
                <List>
                    {props.objects.map(v => <ListItem primaryText={v.name} key={v.id} onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: props.type, id: v.id, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: props.type, id: v.id, version:null})}/>)}
                </List>
                <RaisedButton label="Add new" onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: props.type, id: null, version:null})} href={state.page.link({type:State.PAGE_TYPE.Object, objectType: props.type, id: null, version:null})} />
            </div>
        );
}

export const ObjectList = connect(mapStateToProps, mapDispatchToProps)(ObjectListImpl);
