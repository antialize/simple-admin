import {FitAddon} from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { useEffect, useRef } from 'react';

let fit = new FitAddon();
let term = new Terminal({cursorBlink: false, scrollback: 100000});
term.loadAddon(fit);

export function clear() {
    term.clear();
}

export function add(bytes: string) {
    term.write(bytes);
}

export default function Log() {
    const div = useRef<HTMLDivElement| null>(null);
    useEffect(() => {
        if (div.current == null) return;

        // Delay opening the terminal to the div has rendered
        let t = window.setTimeout(() => {
            if (!div.current) return;
            if (!term.element) {
                term.open(div.current);
            } else {
                div.current.appendChild(term.element);
            }
            fit.fit();
        }, 0);

        let interval = window.setInterval(() => {
            fit.fit();
        }, 500);

        return ()=>{
            window.clearTimeout(t);
            window.clearInterval(interval);
            if (term.element && term.element.parentNode == div.current) {
                console.log("Unmount", term.element, term.element.parentNode);
                div.current?.removeChild(term.element);
            }
        };
    }, []);

    return <div className="deployment_log" ref={div} />
}
