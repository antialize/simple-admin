import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

const fit = new FitAddon();
const term = new Terminal({ cursorBlink: false, scrollback: 100000 });
term.loadAddon(fit);

export function clear(): void {
    term.clear();
}

export function add(bytes: string): void {
    term.write(bytes);
}

export default function Log(): React.ReactElement {
    const div = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (div.current == null) return;

        // Delay opening the terminal to the div has rendered
        const t = window.setTimeout(() => {
            if (!div.current) return;
            if (!term.element) {
                term.open(div.current);
            } else {
                div.current.appendChild(term.element);
            }
            fit.fit();
        }, 0);

        const interval = window.setInterval(() => {
            fit.fit();
        }, 500);

        return () => {
            window.clearTimeout(t);
            window.clearInterval(interval);
            if (term.element && term.element.parentNode === div.current) {
                console.log("Unmount", term.element, term.element.parentNode);
                div.current?.removeChild(term.element);
            }
        };
    }, []);

    return <div className="deployment_log" ref={div} />;
}
