import md5 from 'md5';
import { getSeed, longfromBytes } from '../Util.js';
export class LegacyRandom {
    static MODULUS_BITS = 48;
    static MODULUS_MASK = BigInt('281474976710655');
    static MULTIPLIER = BigInt('25214903917');
    static INCREMENT = BigInt('11');
    static FLOAT_MULTIPLIER = 1 / Math.pow(2, 24);
    static DOUBLE_MULTIPLIER = 1 / Math.pow(2, 30);
    seed = BigInt(0);
    constructor(seed) {
        this.setSeed(seed);
    }
    static fromLargeFeatureSeed(worldSeed, x, z) {
        const random = new LegacyRandom(worldSeed);
        const a = random.nextLong();
        const b = random.nextLong();
        const seed = BigInt(x) * a ^ BigInt(z) * b ^ worldSeed;
        random.setSeed(seed);
        return random;
    }
    static fromLargeFeatureWithSalt(worldSeed, x, z, salt) {
        const seed = BigInt(x) * BigInt('341873128712') + BigInt(z) * BigInt('132897987541') + worldSeed + BigInt(salt);
        return new LegacyRandom(seed);
    }
    fork() {
        return new LegacyRandom(this.nextLong());
    }
    forkPositional() {
        return new LegacyPositionalRandom(this.nextLong());
    }
    setSeed(seed) {
        this.seed = (seed ^ LegacyRandom.MULTIPLIER) & LegacyRandom.MODULUS_MASK;
    }
    advance() {
        this.seed = this.seed * LegacyRandom.MULTIPLIER + LegacyRandom.INCREMENT & LegacyRandom.MODULUS_MASK;
    }
    consume(count) {
        for (let i = 0; i < count; i += 1) {
            this.advance();
        }
    }
    next(bits) {
        this.advance();
        const out = Number(this.seed >> BigInt(LegacyRandom.MODULUS_BITS - bits));
        return out > 2147483647 ? out - 4294967296 : out;
    }
    nextInt(max) {
        if (max === undefined) {
            return this.next(32);
        }
        if ((max & max - 1) == 0) { // If max is a power of two
            return Number(BigInt(max) * BigInt(this.next(31)) >> BigInt(31));
        }
        let a, b;
        while ((a = this.next(31)) - (b = a % max) + (max - 1) < 0) { }
        return b;
    }
    nextLong() {
        return (BigInt(this.next(32)) << BigInt(32)) + BigInt(this.next(32));
    }
    nextFloat() {
        return this.next(24) * LegacyRandom.FLOAT_MULTIPLIER;
    }
    nextDouble() {
        const a = this.next(30);
        this.advance();
        return a * LegacyRandom.DOUBLE_MULTIPLIER;
    }
}
export class LegacyPositionalRandom {
    seed;
    constructor(seed) {
        this.seed = seed;
    }
    at(x, y, z) {
        const seed = getSeed(x, y, z);
        return new LegacyRandom(seed ^ this.seed);
    }
    fromHashOf(name) {
        const hash = md5(name, { asBytes: true });
        const seed = longfromBytes(hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]);
        return new LegacyRandom(seed ^ this.seed);
    }
    seedKey() {
        return [this.seed, BigInt(0)];
    }
}
//# sourceMappingURL=LegacyRandom.js.map