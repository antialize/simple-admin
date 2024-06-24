function nullCheck<T>(v: T | undefined | null, msg = "Expected value"): T {
    if (v === undefined || v === null) throw Error(msg);
    return v;
}

export default nullCheck;
