import * as React from "react";
import * as State from '../../shared/state'
import ObjectFinder from './object_finder'
import { hostId, userId} from '../../shared/type'
import TypeMenuItem, { ObjectMenuList } from './typeMenuItem';
import HostTypeMenuItem from './hostTypeMenuItem';
import state from "./state";
import { observer } from "mobx-react";
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Divider from '@material-ui/core/Divider';
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import Menu from "@material-ui/core/Menu";
import { useState } from "react";
import MenuItem from "@material-ui/core/MenuItem";
import Paper from "@material-ui/core/Paper";
import InputBase from "@material-ui/core/InputBase";
import FormControl from "@material-ui/core/FormControl";
import { withTheme } from "@material-ui/core/styles";
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";
import Popper from "@material-ui/core/Popper";
import Typography from "@material-ui/core/Typography";
import Link from "@material-ui/core/Link";
import { HotKeys } from "react-hotkeys";




function MenuDropdown({children}:{children:any}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    return <>
        <IconButton
            aria-owns={open ? 'render-props-menu' : undefined}
            aria-haspopup="true"
            onClick={event => {setAnchor(event.currentTarget); setOpen(true)}}>
            <MenuIcon />
        </IconButton>
        <Menu id="render-props-menu" anchorEl={anchor} open={open} onClose={()=>setOpen(false)} anchorOrigin={{vertical:'bottom', horizontal: 'left'}} transformOrigin={{vertical: "top", horizontal: "left"}}>
            {children}
        </Menu>
    </>;
}

function SubMenu({title, children}:{title:string, children:any}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    return <>
        <MenuItem
            aria-owns={open ? 'render-props-menu' : undefined}
            aria-haspopup="true"
            onClick={(event) => {setAnchor(event.currentTarget); setOpen(true)}}>
           {title}
        </MenuItem>
        <Menu id="render-props-menu" anchorEl={anchor} open={open} onClose={()=>setOpen(false)} anchorOrigin={{vertical:'top', horizontal: 'right'}} transformOrigin={{vertical: "top", horizontal: "left"}}>
            {children}
        </Menu>
    </>;
}

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

const MatchedText = ({search, text}:{search:string, text:string}) => {
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

const TypeObjects = observer(({search, type, clearSearch}:{search: string, type:number, clearSearch: ()=>void}) => {
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
        <Typography variant="title">Type {state.types.has(type)?state.types.get(type).name:"??"}</Typography>
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
    if (key != "") {
        for (let [type, members] of state.objectDigests) {
            typeFind.push(<TypeObjects search={key} type={type} clearSearch={()=>setKey("")} />);
        }
    }
    return <div ref={e=>setAnchor(e)} style={{backgroundColor: props.theme.palette.primary.light, borderRadius: props.theme.shape.borderRadius, paddingLeft: 10}}>
            <InputBase inputRef={(e)=>searchInput=e} placeholder="Search" value={key} onChange={e=>setKey(e.target.value)}  />
            <IconButton  aria-label="Search" onClick={()=>{searchInput.focus(); searchInput.select();}}>
                <SearchIcon />
            </IconButton>
            <Popper open={key != ""} anchorEl={anchor} placement="bottom-end">
                <Paper style={{padding: 10, minWidth: 350, maxHeight: 1000, overflowY: "auto", zindex:999999}}>
                    <Typography variant="h5" style={{marginBottom: 10}}>Search results</Typography>
                    {typeFind}
                </Paper>
            </Popper>
        </div>;
       
}

const Search = withTheme()(SearchImpl);

export default observer(()=>{
    const types = state.menuTypes;
    return (
        <AppBar position="static">
            <Toolbar>
                <MenuDropdown> 
                    {types.map(t => <SubMenu title={t.name}> <ObjectMenuList type={t.id} /> </SubMenu>)}
                </MenuDropdown>
                <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Dashbord})} href={state.page.link({type:State.PAGE_TYPE.Dashbord})}>Dashbord</Button>
                <Button onClick={(e)=>state.page.onClick(e, {type:State.PAGE_TYPE.Deployment})} href={state.page.link({type:State.PAGE_TYPE.Deployment})}>Deployment</Button>
                <div style={{width: "10px"}} />
                <TypeMenuItem key={hostId} id={hostId} />
                <TypeMenuItem key={userId} id={userId} />
                <div style={{flexGrow: 1}} />
                <Search />
                <div style={{width: "10px"}} />
                <Button onClick={()=>state.login.logout(false)}>Logout</Button>
                <Button onClick={()=>state.login.logout(true)}>Full logout</Button>
            </Toolbar>
    </AppBar>);
});
