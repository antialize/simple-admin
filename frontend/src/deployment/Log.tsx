import * as React from "react";
import {FitAddon} from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import nullCheck from '.././shared/nullCheck';

let fit = new FitAddon();
let theTerm = new Terminal({cursorBlink: false, scrollback: 100000});
theTerm.loadAddon(fit);
let oldCount: number = 0;
let clearCount: number = 0;

export function clear() {
    theTerm.clear();
}

export function add(bytes: string) {
    theTerm.write(bytes);
}

export class Log extends React.Component<{}, {}> {
    div: HTMLDivElement | null = null;

    componentDidMount() {
        theTerm.open(nullCheck(this.div));
        fit.fit();
    }

    render() {
        return <div className="deployment_log" ref={(div)=>this.div=div}/>
    }
}

export default Log;
