import * as React from "react";

let theTerm = new Terminal({cursorBlink: false, scrollback: 100000});
let oldCount: number = 0;
let clearCount: number = 0;

export function clear() {
    theTerm.clear();
}

export function add(bytes: string) {
    theTerm.write(bytes);
}

export class Log extends React.Component<{}, {}> {
    div: HTMLDivElement = null;

    componentDidMount() {
        theTerm.open(this.div);
        theTerm.fit();
    }

    render() {
        return <div className="deployment_log" ref={(div)=>this.div=div}/>
    }
}

export default Log;
