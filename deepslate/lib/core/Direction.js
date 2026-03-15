export var Direction;
(function (Direction) {
    Direction["UP"] = "up";
    Direction["DOWN"] = "down";
    Direction["NORTH"] = "north";
    Direction["EAST"] = "east";
    Direction["SOUTH"] = "south";
    Direction["WEST"] = "west";
})(Direction || (Direction = {}));
const directionNormals = {
    [Direction.UP]: [0, 1, 0],
    [Direction.DOWN]: [0, -1, 0],
    [Direction.NORTH]: [0, 0, -1],
    [Direction.EAST]: [1, 0, 0],
    [Direction.SOUTH]: [0, 0, 1],
    [Direction.WEST]: [-1, 0, 0],
};
(function (Direction) {
    Direction.ALL = [Direction.UP, Direction.DOWN, Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST];
    function normal(dir) {
        return directionNormals[dir];
    }
    Direction.normal = normal;
})(Direction || (Direction = {}));
//# sourceMappingURL=Direction.js.map