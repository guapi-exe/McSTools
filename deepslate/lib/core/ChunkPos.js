export var ChunkPos;
(function (ChunkPos) {
    function create(x, z) {
        return [x, z];
    }
    ChunkPos.create = create;
    function fromBlockPos(blockPos) {
        return [blockPos[0] >> 4, blockPos[2] >> 4];
    }
    ChunkPos.fromBlockPos = fromBlockPos;
    function fromLong(long) {
        return [Number(long) & 0xFFFFFFFF, Number(long >> BigInt(32))];
    }
    ChunkPos.fromLong = fromLong;
    function toLong(chunkPos) {
        return asLong(chunkPos[0], chunkPos[1]);
    }
    ChunkPos.toLong = toLong;
    function asLong(x, z) {
        return BigInt(x & 0xFFFFFFFF) | BigInt(z & 0xFFFFFFFF) << BigInt(32);
    }
    ChunkPos.asLong = asLong;
    function minBlockX(chunkPos) {
        return chunkPos[0] << 4;
    }
    ChunkPos.minBlockX = minBlockX;
    function minBlockZ(chunkPos) {
        return chunkPos[1] << 4;
    }
    ChunkPos.minBlockZ = minBlockZ;
    function maxBlockX(chunkPos) {
        return (chunkPos[0] << 4) + 15;
    }
    ChunkPos.maxBlockX = maxBlockX;
    function maxBlockZ(chunkPos) {
        return (chunkPos[1] << 4) + 15;
    }
    ChunkPos.maxBlockZ = maxBlockZ;
})(ChunkPos || (ChunkPos = {}));
//# sourceMappingURL=ChunkPos.js.map