import * as React from "react";
import {List, ListItem} from 'material-ui/List';
import Drawer from 'material-ui/Drawer';
import Divider from 'material-ui/Divider';
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as page from './page'
import {ObjectFinder} from './object_finder'
import {IType, hostId, typeId, rootInstanceId, rootId} from '../../shared/type'

interface Props {
    setPage(e: React.MouseEvent<{}>, page:State.IPage):void;
    hosts: State.IObjectDigest[];
    types: State.IObject2<IType>[];
    rootId: number;
}

function mapStateToProps(s:IMainState) {
    let hosts = (s.objectDigests[hostId] || []).slice(0);
    hosts.sort((l, r)=>{return l.name < r.name?-1:1});

    let types: State.IObject2<IType>[] = [];
    if (s.types)
        for (let key in s.types)
            types.push(s.types[key]);

    types.sort((l, r)=>{
        if (l.id == hostId) return -1;
        if (r.id == hostId) return 1;
        if (l.id == typeId) return 1;
        if (r.id == typeId) return -1;
        return l.name < r.name?-1:1
    })

    return {hosts, rootId, types};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }    
}

function MenuImpl(props:Props) {
    const hostList = props.hosts.map(n=>
        <ListItem primaryText={n.name}
            key={n.id}
            onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: n.id, version:null})}
            href={page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: n.id, version:null})}/>);
    hostList.push(
        <ListItem
            key="add" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: null, version:null})}
            href={page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: null, version:null})}>Add new</ListItem>);

    return (<Drawer open={true}>
        <List>
            <ListItem primaryText="Dashbord" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Dashbord})} href={page.link({type:State.PAGE_TYPE.Dashbord})}></ListItem>
            <Divider/>
            {props.types.map(t => {
                if (t.content.kind == "trigger") return;
                if (t.id == rootId)
                    return <ListItem primaryText={t.name}
                        key={rootInstanceId}
                        onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
                        href={page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}/>;

                return <ListItem key={t.id} primaryText={t.content.plural} onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, objectType:t.id})} href={page.link({type:State.PAGE_TYPE.ObjectList, objectType:t.id})} 
                        nestedItems={t.id == hostId?hostList:undefined} initiallyOpen={t.id == hostId}
                        />
            })}
            <Divider/>
            <ListItem primaryText="Deployment" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Deployment})} href={page.link({type:State.PAGE_TYPE.Deployment})}/>
            <Divider/>
            <ListItem primaryText={<ObjectFinder />} />
        </List>
    </Drawer>);
}

export let Menu = connect(mapStateToProps, mapDispatchToProps)(MenuImpl);
