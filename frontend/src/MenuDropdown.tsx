import * as React from "react";
import IconButton from "@material-ui/core/IconButton";
import Menu from "@material-ui/core/Menu";
import MenuIcon from '@material-ui/icons/Menu';
import { useState } from "react";
import MenuItem from "@material-ui/core/MenuItem";
import Button from "@material-ui/core/Button";

const DropDownOpen = React.createContext({
    open: false,
    setOpen: (open:boolean) => {}
});

export class DropDownItem extends React.Component<{onClick?: (e : React.MouseEvent)=>void, children?: React.ReactNode, href?:string}, {}> {
    render() {
        const p=this.props;
        return <MenuItem onClick={(e)=>{this.context.setOpen(false); p.onClick && p.onClick(e)}} href={p.href}>{p.children}</MenuItem>;
    }
};
DropDownItem.contextType = DropDownOpen;


function MenuDropdown({ title, children }: {
    title?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    return <DropDownOpen.Provider value={{open, setOpen}}>
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
    </DropDownOpen.Provider>;
}

export default MenuDropdown;
