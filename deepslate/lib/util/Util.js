export function lazy(getter) {
    let value = null;
    return () => {
        if (value == null) {
            value = getter();
        }
        return value;
    };
}
export function computeIfAbsent(map, key, getter) {
    const existing = map.get(key);
    if (existing !== undefined) {
        return existing;
    }
    const value = getter(key);
    map.set(key, value);
    return value;
}
export function mutateWithDefault(map, key, initialValue, mutator) {
    const existing = map.get(key);
    const value = existing ?? initialValue;
    mutator(value, key);
    map.set(key, value);
    return value;
}
//# sourceMappingURL=Util.js.map