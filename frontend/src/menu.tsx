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

interface Props {
    setPage(e: React.MouseEvent<{}>, page:State.IPage):void;
    hosts: State.INameIdPair[];
}

function mapStateToProps(s:IMainState) {
    let lst = s.objectNamesAndIds['host'];
    if (lst === undefined) lst = [];
    lst.sort((l, r)=>{return l.name < r.name?-1:1}) ;
    return {'hosts': lst};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        setPage: (e: React.MouseEvent<{}>, p: State.IPage) => {
            page.onClick(e, p, dispatch);
        }
    }    
}

function MenuImpl(props:Props) {
    const hostList = props.hosts.map(n=><ListItem primaryText={n.name} key={n.id} onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, class: 'host', id: n.id, version:null})} href={page.link({type:State.PAGE_TYPE.Object, class: 'host', id: n.id, version:null})}/>);
    //hostList.push(<ListItem key="div1" containerElement={<Divider />} />);
    hostList.push(<ListItem key="add" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Object, class: 'host', id: null, version:null})} href={page.link({type:State.PAGE_TYPE.Object, class: 'host', id: null, version:null})}>Add new</ListItem>);

/*
 <ListItem primaryText="Users" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"user"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"user"})} />
            <ListItem primaryText="Groups" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"group"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"group"})}/>
            <ListItem primaryText="Files" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"file"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"file"})}/>
            <ListItem primaryText="Collections" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"collection"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"collection"})}/>
            <ListItem primaryText="Packages" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"package"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"package"})}/>*/
    return (<Drawer open={true}>
        <List>
            <ListItem primaryText="Dashbord" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.Dashbord})} href={page.link({type:State.PAGE_TYPE.Dashbord})}></ListItem>
            <Divider/>
            <ListItem primaryText="Hosts" onClick={(e)=>props.setPage(e, {type:State.PAGE_TYPE.ObjectList, class:"host"})} href={page.link({type:State.PAGE_TYPE.ObjectList, class:"host"})}
                nestedItems={hostList} open={true} />
            <Divider/>
        </List>
    </Drawer>);
}

export let Menu = connect(mapStateToProps, mapDispatchToProps)(MenuImpl);
