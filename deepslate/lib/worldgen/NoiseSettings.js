import { clampedLerp } from '../math/index.js';
import { Json } from '../util/index.js';
export var NoiseSettings;
(function (NoiseSettings) {
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        return {
            minY: Json.readInt(root.min_y) ?? 0,
            height: Json.readInt(root.height) ?? 256,
            xzSize: Json.readInt(root.size_horizontal) ?? 1,
            ySize: Json.readInt(root.size_vertical) ?? 1,
        };
    }
    NoiseSettings.fromJson = fromJson;
    function create(settings) {
        return {
            minY: 0,
            height: 256,
            xzSize: 1,
            ySize: 1,
            ...settings,
        };
    }
    NoiseSettings.create = create;
    function cellHeight(settings) {
        return settings.ySize << 2;
    }
    NoiseSettings.cellHeight = cellHeight;
    function cellWidth(settings) {
        return settings.xzSize << 2;
    }
    NoiseSettings.cellWidth = cellWidth;
    function cellCountY(settings) {
        return settings.height / cellHeight(settings);
    }
    NoiseSettings.cellCountY = cellCountY;
    function minCellY(settings) {
        return Math.floor(settings.minY / cellHeight(settings));
    }
    NoiseSettings.minCellY = minCellY;
})(NoiseSettings || (NoiseSettings = {}));
export var NoiseSlideSettings;
(function (NoiseSlideSettings) {
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        return {
            target: Json.readNumber(root.target) ?? 0,
            size: Json.readInt(root.size) ?? 0,
            offset: Json.readInt(root.offset) ?? 0,
        };
    }
    NoiseSlideSettings.fromJson = fromJson;
    function apply(slide, density, y) {
        if (slide.size <= 0)
            return density;
        const t = (y - slide.offset) / slide.size;
        return clampedLerp(slide.target, density, t);
    }
    NoiseSlideSettings.apply = apply;
})(NoiseSlideSettings || (NoiseSlideSettings = {}));
//# sourceMappingURL=NoiseSettings.js.map