function nullCheck<T>(v: T | undefined | null, msg:string = "Expected value") {
    if (v === undefined || v === null) throw Error(msg);
    return v;
}

export default nullCheck;