export var Cull;
(function (Cull) {
    function rotate(cull, x, y) {
        let { up, down, north, east, south, west } = cull;
        switch (y) {
            case 90:
                [north, east, south, west] = [east, south, west, north];
                break;
            case 180:
                [north, east, south, west] = [south, west, north, east];
                break;
            case 270:
                [north, east, south, west] = [west, north, east, south];
        }
        switch (x) {
            case 90:
                [up, north, down, south] = [north, down, south, up];
                break;
            case 180:
                [up, north, down, south] = [down, south, up, north];
                break;
            case 270:
                [up, north, down, south] = [south, up, north, down];
        }
        return { up, down, north, east, south, west };
    }
    Cull.rotate = rotate;
    function none() {
        return Object.create(null);
    }
    Cull.none = none;
})(Cull || (Cull = {}));
//# sourceMappingURL=Cull.js.map