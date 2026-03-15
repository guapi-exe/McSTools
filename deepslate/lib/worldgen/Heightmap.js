export var Heightmap;
(function (Heightmap) {
    function fromJson(obj) {
        if (typeof obj === 'string') {
            if (obj === 'WORLD_SURFACE_WG' || obj === 'WORLD_SURFACE' || obj === 'OCEAN_FLOOR_WG' || obj === 'OCEAN_FLOOR' || obj === 'MOTION_BLOCKING' || obj === 'MOTION_BLOCKING_NO_LEAVES') {
                return obj;
            }
        }
    }
    Heightmap.fromJson = fromJson;
})(Heightmap || (Heightmap = {}));
//# sourceMappingURL=Heightmap.js.map