import * as React from "react";

export function Size({size:size}:{size:number}) {
    if (size < 1024)
        return <span>{size}B</span>
    else if (size < 1024*102)
        return <span>{(size/1024).toFixed(1)}KB</span>
    else if (size < 1024*1024)
        return <span>{(size/1024).toFixed(0)}KB</span>
    else if (size < 1024*1024*102)
        return <span>{(size/1024/1024).toFixed(1)}MB</span>
    else if (size < 1024*1024*1024)
        return <span>{(size/1024/1024).toFixed(0)}MB</span>
    else if (size < 1024*1024*1024*102)
        return <span>{(size/1024/1024/1024).toFixed(1)}GB</span>
    else if (size < 1024*1024*1024*1024)
        return <span>{(size/1024/1024/1024).toFixed(0)}GB</span>
    return <span>{(size/1024/1024/1024/1024).toFixed(1)}TB</span>
}