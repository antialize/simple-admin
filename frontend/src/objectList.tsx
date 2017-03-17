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

interface IProps {
    class: string;
}

interface Props {
    objects: State.INameIdPair[];
    filter: string;
    class: string;
    setFilter(filter:string):void;
    setPage(e: React.MouseEvent<{}>, p: State.IPage):void;
}

function mapStateToProps(s:IMainState, o:IProps) {
    let lst = (o.class in s.objectNamesAndIds ? s.objectNamesAndIds[o.class] : []);
    let filt = (o.class in s.objectListFilter ? s.objectListFilter[o.class] : "");
    lst = lst.filter((st)=>st.name.toUpperCase().includes(filt.toUpperCase()));
    lst.sort((l,r)=>{return l.name < r.name ? -1 : 1;});
    return {
        objects:  lst,
        filter: filt,
        class: o.class
    }
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:IProps) {
    return {
        setFilter: (filter:string) => {
            const p:Actions.ISetObjectListFilter = {
                type: Actions.ACTION.SetObjectListFilter,
                filter: filter,
                class: o.class
            };
            dispatch(p);
        },
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }
}

function ObjectListImpl(props:Props) {
    return (
            <div>
                <TextField floatingLabelText="Filter" onChange={(a, v)=>{props.setFilter(v);}} value={props.filter}/>
                <List>
                    {props.objects.map(v => <ListItem primaryText={v.name} key={v.id} onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, class: props.class, id: v.id, version:null})} href={page.link({type:State.PAGE_TYPE.Object, class: props.class, id: v.id, version:null})}/>)}
                </List>
                <RaisedButton label="Add new" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, class: props.class, id: null, version:null})} href={page.link({type:State.PAGE_TYPE.Object, class: props.class, id: null, version:null})} />
            </div>
        );
}

export const ObjectList = connect(mapStateToProps, mapDispatchToProps)(ObjectListImpl);