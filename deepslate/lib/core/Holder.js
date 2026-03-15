import { Identifier } from './Identifier.js';
export var Holder;
(function (Holder) {
    function parser(registry, directParser) {
        return (obj) => {
            if (typeof obj === 'string') {
                return reference(registry, Identifier.parse(obj));
            }
            else {
                return direct(directParser(obj));
            }
        };
    }
    Holder.parser = parser;
    function direct(value, id) {
        return {
            value: () => value,
            key: () => id,
        };
    }
    Holder.direct = direct;
    function reference(registry, id, required = true) {
        if (required) {
            return {
                value: () => registry.getOrThrow(id),
                key: () => id,
            };
        }
        else {
            return {
                value: () => registry.get(id),
                key: () => id,
            };
        }
    }
    Holder.reference = reference;
})(Holder || (Holder = {}));
//# sourceMappingURL=Holder.js.map