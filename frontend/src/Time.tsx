import * as React from "react";

function Time({seconds:delta}:{seconds:number}) {
    if (delta < 10)             
        return <span>{Math.round(delta*1000)}ms</span>;
    let de = delta;
    let y = Math.trunc(de/(60*60*24*356.25));
    de -= y * 60*60*24*356.25;
    let d = Math.trunc(de/(60*60*24));
    de -= d * 60*60*24;
    let h = Math.trunc(de/(60*60));
    de -= h * 60 * 60;
    let m = Math.trunc(de/60);
    let s = (de - m*60).toFixed(1);

    if (y != 0) return <span>{y}y {d}d {h}h {m}m {s}s</span>;
    if (d != 0) return <span>{d}d {h}h {m}m {s}s</span>;
    if (h != 0) return <span>{h}h {m}m {s}s</span>;
    if (m != 0) return <span>{m}m {s}s</span>;
    return <span>{s}s</span>;
}

export default Time;
