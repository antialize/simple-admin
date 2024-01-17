import {Menu, MenuItem} from "@mui/material";
import {useState} from "react";

function SubMenu({title, children}: {title: string; children: any}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
        <>
            <MenuItem
                aria-owns={open ? "render-props-menu" : undefined}
                aria-haspopup="true"
                onClick={event => {
                    setAnchor(event.currentTarget);
                    setOpen(true);
                }}>
                {title}
            </MenuItem>
            <Menu
                id="render-props-menu"
                anchorEl={anchor}
                open={open}
                onClose={() => {
                    setOpen(false);
                }}
                anchorOrigin={{vertical: "top", horizontal: "right"}}
                transformOrigin={{vertical: "top", horizontal: "left"}}>
                {children}
            </Menu>
        </>
    );
}

export default SubMenu;
