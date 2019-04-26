import * as React from "react";
import * as State from '../../shared/state'
import AppBar from "@material-ui/core/AppBar";
import Button from '@material-ui/core/Button';
import IconButton from "@material-ui/core/IconButton";
import InputBase from "@material-ui/core/InputBase";
import Link from "@material-ui/core/Link";
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import MenuDropdown, { DropDownItem } from "./MenuDropdown";
import Paper from "@material-ui/core/Paper";
import Popper from "@material-ui/core/Popper";
import SearchIcon from '@material-ui/icons/Search';
import SubMenu from "./SubMenu";
import Toolbar from "@material-ui/core/Toolbar";
import TypeMenuItem, { ObjectMenuList } from './TypeMenuItem';
import Typography from "@material-ui/core/Typography";
import state from "./state";
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";
import { hostId, userId, rootId, rootInstanceId} from '../../shared/type'
import { observer } from "mobx-react";
import { useState } from "react";
import { withTheme } from "@material-ui/core/styles";
import derivedState from './derivedState';
import {HotKeyListener, HotKeyPortal} from "./HotKey";
import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Badge from '@material-ui/core/Badge';
import MailIcon from '@material-ui/icons/Mail';

function matchText(text:string, key:string) {
    if (!key || key.length == 0) return false;
    let ki=0;
    for (let i=0; i < text.length; ++i) {
        if (text[i] != key[ki]) continue;
        ++ki;
        if (ki == key.length) return true;
    }
    return false;
}

function MatchedText({search, text}:{search:string, text:string}) {
    let ans=[];
    let ki=0;
    let j=0;
    for (let i=0; i < text.length;) {
        if (text[i] == search[ki]) {
            if (j != i)
                ans.push(text.slice(j, i));
            j=i;
            while (i < text.length && ki < search.length && text[i] == search[ki]) {
                ++i;
                ++ki;
            }
            ans.push(<span style={{color:"red"}}>{text.slice(j, i)}</span>);
            j=i;
        } else {
            ++i;
        }
    } 
    if (j != text.length)
        ans.push(text.slice(j));

    return <>{ans}</>;
};

const TypeObjects = observer(function TypeObjects({search, type, clearSearch}:{search: string, type:number, clearSearch: ()=>void}) {
    let ans = [];
    for (let [id, p] of state.objectDigests.get(type)) {
        if (!matchText(p.name, search)) continue;
        ans.push(
            <ListItem>
                <Link color={"textPrimary" as any} 
                    href={state.page.link({type: State.PAGE_TYPE.Object, objectType: type, id, version:null})}
                    onClick={(e:any)=>{clearSearch(); return state.page.onClick(e, {type: State.PAGE_TYPE.Object, objectType: type, id, version:null});}}>
                    <MatchedText search={search} text={p.name} />
                </Link>
            </ListItem>);
    }
    if (!ans.length) return <> </>;

    return <>
        <Typography variant="h4">Type {state.types.has(type)?state.types.get(type).name:"??"}</Typography>
        <List>
            {ans}
        </List>
    </>;
});


let searchInput: HTMLInputElement = null;
function SearchImpl(props:ThemedComponentProps) {
    const [key, setKey] = useState("");
    const [anchor, setAnchor] = useState(null);

    const typeFind = [];
    let first: [number, number] = null;
    if (key != "") {
        for (let [type, members] of state.objectDigests) {
            if (!first) {
                for (let [id, p] of state.objectDigests.get(type)) {
                    if (!matchText(p.name, key)) continue;
                    first = [type, id];
                    break;
                }
            }
            typeFind.push(<TypeObjects search={key} type={type} clearSearch={()=>setKey("")} />);
        }
    }
    return <HotKeyListener handlers={{
            'search': (e)=>{searchInput.focus(); setKey(""); return false;}
        }}>
            <div ref={e=>setAnchor(e)} style={{backgroundColor: props.theme.palette.primary.light, borderRadius: props.theme.shape.borderRadius, paddingLeft: 10}}>
                <InputBase inputRef={(e)=>searchInput=e} placeholder="Search" value={key} onChange={e=>setKey(e.target.value)}  />
                <IconButton  aria-label="Search" onClick={()=>{searchInput.focus(); searchInput.select();}}>
                    <SearchIcon />
                </IconButton>
                <Popper open={key != ""} anchorEl={anchor} placement="bottom-end" style={{zIndex: 99999}}>
                    <HotKeyPortal hotkeys={{close: '!esc', first: '!return'}} >
                        <HotKeyListener
                            handlers={{
                                close: ()=> {setKey(""); searchInput.blur(); },
                                first: ()=> {state.page.set({type: State.PAGE_TYPE.Object, objectType: first[0], id: first[1], version:null}); setKey(""); searchInput.blur();}}} >
                            <ClickAwayListener onClickAway={()=>setKey("")}>
                                <Paper style={{padding: 10, minWidth: 350, maxHeight: 1000, overflowY: "auto"}}>
                                    <Typography variant="h5" style={{marginBottom: 10}}>Search results</Typography>
                                    {typeFind}
                                </Paper>
                            </ClickAwayListener>
                        </HotKeyListener>
                    </HotKeyPortal>
                </Popper>
            </div>
        </HotKeyListener>
       
}

const Search = withTheme()(SearchImpl);

const Menu = observer(function Menu() {
    const types = derivedState.menuTypes;
    return (
        <AppBar position="static">
            <Toolbar>
                <HotKeyListener
                    handlers={{
                        dashbord: (e)=>state.page.set({type:State.PAGE_TYPE.Dashbord}),
                        images: (e)=>state.page.set({type:State.PAGE_TYPE.DockerImages}),
                        containers: (e)=>state.page.set({type:State.PAGE_TYPE.DockerContainers}),
                    }}>
                    <MenuDropdown hotkey='menu'>
                        {types.map(t =>
                            t.id == rootId
                            ? <DropDownItem key={rootInstanceId}
                                onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}
                                href={state.page.link({type:State.PAGE_TYPE.Object, objectType: rootId, id: rootInstanceId, version:null})}>Root</DropDownItem>
                            : <SubMenu title={t.name} key={t.name}>  <ObjectMenuList type={t.id} /> </SubMenu>
                        )}
                    </MenuDropdown>
                    <Badge color="secondary" badgeContent={state.activeMessages}>
                        <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}>Dashbord</Button>
                    </Badge>
                    <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}>Deployment</Button>
                    <div style={{width: "10px"}} />
                    <TypeMenuItem key={hostId} id={hostId} />
                    <TypeMenuItem key={userId} id={userId} />
                    <div style={{width: "10px"}} />
                    <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.DockerImages})} href={state.page.link({type:State.PAGE_TYPE.DockerImages})}>Images</Button>
                    <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.DockerContainers})} href={state.page.link({type:State.PAGE_TYPE.DockerContainers})}>Containers</Button>
                    <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.ModifiedFiles})} href={state.page.link({type:State.PAGE_TYPE.ModifiedFiles})}>Modified Files</Button>
                    <div style={{flexGrow: 1}} />
                    <Search />
                    <div style={{width: "10px"}} />
                    <Button onClick={()=>state.login.logout(false)}>Logout</Button>
                    <Button onClick={()=>state.login.logout(true)}>Full logout</Button>
                </HotKeyListener>
            </Toolbar>
    </AppBar>);
});

export default Menu;
