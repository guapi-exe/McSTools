import { Json } from '../util/index.js';
export var VerticalAnchor;
(function (VerticalAnchor) {
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        if (root.absolute !== undefined) {
            return absolute(Json.readNumber(root.absolute) ?? 0);
        }
        else if (root.above_bottom !== undefined) {
            return aboveBottom(Json.readNumber(root.above_bottom) ?? 0);
        }
        else if (root.below_top !== undefined) {
            return belowTop(Json.readNumber(root.below_top) ?? 0);
        }
        return () => 0;
    }
    VerticalAnchor.fromJson = fromJson;
    function absolute(value) {
        return () => value;
    }
    VerticalAnchor.absolute = absolute;
    function aboveBottom(value) {
        return context => context.minY + value;
    }
    VerticalAnchor.aboveBottom = aboveBottom;
    function belowTop(value) {
        return context => context.minY + context.height - 1 - value;
    }
    VerticalAnchor.belowTop = belowTop;
})(VerticalAnchor || (VerticalAnchor = {}));
//# sourceMappingURL=VerticalAnchor.js.map