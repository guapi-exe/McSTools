export var Json;
(function (Json) {
    function readNumber(obj) {
        return typeof obj === 'number' ? obj : undefined;
    }
    Json.readNumber = readNumber;
    function readInt(obj) {
        return typeof obj === 'number' ? Math.floor(obj) : undefined;
    }
    Json.readInt = readInt;
    function readString(obj) {
        return typeof obj === 'string' ? obj : undefined;
    }
    Json.readString = readString;
    function readBoolean(obj) {
        return typeof obj === 'boolean' ? obj : undefined;
    }
    Json.readBoolean = readBoolean;
    function readObject(obj) {
        return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
            ? obj
            : undefined;
    }
    Json.readObject = readObject;
    function readArray(obj, parser) {
        if (!Array.isArray(obj))
            return undefined;
        if (!parser)
            return obj;
        return obj.map(el => parser(el));
    }
    Json.readArray = readArray;
    function readPair(obj, parser) {
        if (!Array.isArray(obj))
            return undefined;
        return [0, 1].map((i => parser(obj[i])));
    }
    Json.readPair = readPair;
    function readMap(obj, parser) {
        const root = readObject(obj) ?? {};
        return Object.fromEntries(Object.entries(root).map(([k, v]) => [k, parser(v)]));
    }
    Json.readMap = readMap;
    function compose(obj, parser, mapper) {
        const result = parser(obj);
        return result ? mapper(result) : undefined;
    }
    Json.compose = compose;
    function readEnum(obj, values) {
        if (typeof obj !== 'string')
            return values[0];
        if (values.includes(obj))
            return obj;
        return values[0];
    }
    Json.readEnum = readEnum;
})(Json || (Json = {}));
//# sourceMappingURL=Json.js.map