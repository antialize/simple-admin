import * as React from "react";
import IconButton from "@material-ui/core/IconButton";
import Menu from "@material-ui/core/Menu";
import MenuIcon from '@material-ui/icons/Menu';
import { useState } from "react";

function MenuDropdown({ children }: {
    children: any;
}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    return <>
        <IconButton aria-owns={open ? 'render-props-menu' : undefined} aria-haspopup="true" onClick={event => { setAnchor(event.currentTarget); setOpen(true); }}>
            <MenuIcon />
        </IconButton>
        <Menu id="render-props-menu" anchorEl={anchor} open={open} onClose={() => setOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
            {children}
        </Menu>
    </>;
}

export default MenuDropdown;
