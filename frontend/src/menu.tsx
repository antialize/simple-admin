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
import Avatar from 'material-ui/Avatar';

interface Props {
    setPage(e: React.MouseEvent<{}>, page:State.IPage):void;
    hosts: {id:number, name:string, down:boolean, messages:number}[];
    types: State.IObject2<IType>[];
    rootId: number;
}

function mapStateToProps(s:IMainState) {

    let hostMessages: {[id:number]: number} = {};

    for (const id in s.messages) {
        const message = s.messages[id];
        if (message.dismissed || message.host == null) continue;
        if (!(message.host in hostMessages)) hostMessages[message.host] = 1;
        else hostMessages[message.host]++;
    }
    let hosts: {id:number, name:string, down:boolean, messages:number}[] = [];
    if (s.objectDigests[hostId]) {

        hosts = s.objectDigests[hostId].map(v => { 
            let st = s.status[v.id];
            return {
            id: v.id,
            name: v.name,
            down: !st || !st.up,
            messages: hostMessages[v.id] || 0
        }}
        )
    }

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
            style={{color:n.down?"red":"black"}}
            key={n.id}
            onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, objectType: hostId, id: n.id, version:null})}
            rightAvatar={n.messages?(<Avatar color="black" backgroundColor="red">{n.messages}</Avatar>):null}
            href={page.link({type:State.PAGE_TYPE.Object, objectType: hostId, id: n.id, version:null})}/>);

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
