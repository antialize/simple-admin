function getDefault<K, V>(map: Map<K, V>, key: K, create: ()=>V) {
    const v = map.get(key);
    if (v !== undefined) return v;
    const vv = create();
    map.set(key, vv);
    return map.get(key)!;
}

export default getDefault;