function getDefault<K, V>(map: Map<K, V>, key: K, create: () => V): V {
    const v = map.get(key);
    if (v !== undefined) return v;
    const vv = create();
    map.set(key, vv);
    return vv;
}

export default getDefault;
