import * as React from "react";
import * as Mousetrap from 'mousetrap';
import 'mousetrap-global-bind';

class Portal {
    handlers: Map<string, Map<number, (e:KeyboardEvent) => boolean|void>> = new Map;
    idToAction: Map<number, string> = new Map;
    idc = 0;

    constructor(public hotkeys: {[action:string]: string | string[]}) {}

    addHandler(action:string, cb: (e:KeyboardEvent) => boolean|void): number {
        if (!this.handlers.has(action)) this.handlers.set(action, new Map);
        const id = this.idc++;
        this.handlers.get(action).set(id, cb);
        this.idToAction.set(id, action);
        return id;
    }

    removeHandler(id: number) {
        const action = this.idToAction.get(id);
        this.idToAction.delete(id);
        this.handlers.get(action).delete(id);
    }

    bind() {
        const inner = (action: string, s: string) => {
            if (!s) return;
            let cb = (e:KeyboardEvent) => {
                if (!this.handlers.has(action)) return;
                for (const [_, cb] of this.handlers.get(action)) {
                    if (cb(e) === false) {
                        e.returnValue = false;
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                        e.preventDefault();
                        return false;
                    }
                }
            };
            if (s[0] == "!")
                Mousetrap.bindGlobal(s.slice(1), cb);
            else
                Mousetrap.bind(s, cb);
        }

        for (const action in this.hotkeys) {
            const hk = this.hotkeys[action];
            if (Array.isArray(hk)) 
                for (let s of hk)
                    inner(action, s);
            else
                inner(action, hk);
        }
    }

    unbind() {
        const inner = (action: string, s: string) => {
            if (!s) return;
            if (s[0] == "!") 
                (Mousetrap as any).unbindGlobal(s.slice(1));
            else 
                Mousetrap.unbind(s);
        }
        for (const action in this.hotkeys) {
            const hk = this.hotkeys[action];
            if (Array.isArray(hk)) 
                for (let s of hk)
                    inner(action, s);
            else
                inner(action, hk);
        }
    }
};
const PortalContext = React.createContext(null as Portal);


export class HotKeyListener extends React.Component<{children: React.ReactNode, handlers: {[action:string]: (e:KeyboardEvent) => void}},{}> {
    old: {[action:string]: (e:KeyboardEvent) => void} = null;
    bindings: number[] = [];

    componentWillUnmount() {
        for (const key of this.bindings)
            this.context.removeHandler(key);
        this.bindings = [];
    }

    render() {
        if (this.props.handlers != this.old) {
            for (const key of this.bindings)
                this.context.removeHandler(key);
            this.bindings = [];
            for (const key in this.props.handlers)
                this.bindings.push(this.context.addHandler(key, this.props.handlers[key]));
        }
        return <>{this.props.children}</>;
    }
}
HotKeyListener.contextType = PortalContext;

let currentPortal: Portal;

type HotKeyPortalProps = {children?: React.ReactNode, hotkeys: {[action:string]: string | string[]}};

export class HotKeyPortal extends React.Component<HotKeyPortalProps, {}> {
    portal: Portal; 
    parent: Portal;

    constructor(props:HotKeyPortalProps) {
        super(props);
        this.portal = new Portal(props.hotkeys);
    }

    componentDidMount() {
        this.parent = currentPortal;
        currentPortal = this.portal;
        if (this.parent) this.parent.unbind();
        this.portal.bind();
    }

    componentWillUnmount() {
        this.portal.unbind();
        if (this.parent) this.parent.bind();
        currentPortal = this.parent;
    }

    render() {
        return <PortalContext.Provider value={this.portal}>{this.props.children}</PortalContext.Provider>;
    }
};
