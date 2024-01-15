import { Button, IconButton, Menu, MenuItem } from "@mui/material";
import React, { useContext, useState } from "react";
import MenuIcon from '@mui/icons-material/Menu';
import { useHotkeys } from "react-hotkeys-hook";

const DropDownOpen = React.createContext({
    open: false,
    setOpen: (_:boolean) => {}
});

export function DropDownItem(p: {onClick?: (e : React.MouseEvent)=>void, children?: React.ReactNode, href?:string}) {
    let context = useContext(DropDownOpen);
    return <MenuItem onClick={(e)=>{context.setOpen(false); p.onClick && p.onClick(e)}}>{p.children}</MenuItem>;
}

function MenuDropdown({ title, children, hotkey }: {
    hotkey?: string
    title?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    if (hotkey)
        useHotkeys(hotkey, ()=>{setOpen(true);});
    return (
        <DropDownOpen.Provider value={{open, setOpen}}>
            {title?
                <Button
                    aria-owns={open ? 'render-props-menu' : undefined}
                    aria-haspopup="true"
                    onClick={event => {setAnchor(event.currentTarget); setOpen(true)}}
                    >
                    {title}
                </Button>
                : <IconButton aria-owns={open ? 'render-props-menu' : undefined} aria-haspopup="true" onClick={event => { setAnchor(event.currentTarget); setOpen(true); }}>
                    <MenuIcon />
                </IconButton>
            }
            <Menu id="render-props-menu" anchorEl={anchor} open={open} onClose={() => setOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
                {children}
            </Menu>
        </DropDownOpen.Provider>)
}

export default MenuDropdown;
