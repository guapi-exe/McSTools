import { Json } from './Json.js';
export var Color;
(function (Color) {
    function fromJson(obj) {
        const packed = Json.readNumber(obj);
        if (packed)
            return intToRgb(packed);
        const array = Json.readArray(obj, o => Json.readNumber(o) ?? 0);
        if (array === undefined || array.length !== 3)
            return undefined;
        return array;
    }
    Color.fromJson = fromJson;
    function fromNbt(nbt) {
        if (nbt.isNumber())
            return intToRgb(nbt.getAsNumber());
        if (!nbt.isListOrArray())
            return undefined;
        const values = nbt.getItems();
        if (values.length < 3)
            return undefined;
        return values.map(i => i.getAsNumber());
    }
    Color.fromNbt = fromNbt;
    function intToRgb(n) {
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return [r / 255, g / 255, b / 255];
    }
    Color.intToRgb = intToRgb;
})(Color || (Color = {}));
//# sourceMappingURL=Color.js.map