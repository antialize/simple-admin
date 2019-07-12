import * as React from "react";
import IconButton from "@material-ui/core/IconButton";
import Menu from "@material-ui/core/Menu";
import MenuIcon from '@material-ui/icons/Menu';
import { useState } from "react";
import MenuItem from "@material-ui/core/MenuItem";
import Button from "@material-ui/core/Button";
import { HotKeyListener } from "./HotKey";

const DropDownOpen = React.createContext({
    open: false,
    setOpen: (open:boolean) => {}
});

export class DropDownItem extends React.Component<{onClick?: (e : React.MouseEvent)=>void, children?: React.ReactNode, href?:string}, {}> {
    render() {
        const p=this.props;
        return <MenuItem onClick={(e)=>{this.context.setOpen(false); p.onClick && p.onClick(e)}}>{p.children}</MenuItem>;
    }
};
DropDownItem.contextType = DropDownOpen;


function MenuDropdown({ title, children, hotkey }: {
    hotkey?: string
    title?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const handlers: {[key:string]: (e:KeyboardEvent)=>void} = {};
    if (hotkey)
        handlers[hotkey] = (e)=>{
            setOpen(true);
        }
    return (
        <DropDownOpen.Provider value={{open, setOpen}}>
            <HotKeyListener handlers={handlers}>
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
            </HotKeyListener>
        </DropDownOpen.Provider>)

}

export default MenuDropdown;
