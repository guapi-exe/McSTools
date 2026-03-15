import md5 from 'md5';
import { getSeed, longfromBytes } from '../Util.js';
export class XoroshiroRandom {
    static SILVER_RATIO_64 = BigInt('7640891576956012809');
    static GOLDEN_RATIO_64 = BigInt('-7046029254386353131');
    static FLOAT_MULTIPLIER = 1 / Math.pow(2, 24);
    static DOUBLE_MULTIPLIER = 1.1102230246251565E-16;
    static BIGINT_1 = BigInt(1);
    static BIGINT_17 = BigInt(17);
    static BIGINT_21 = BigInt(21);
    static BIGINT_27 = BigInt(27);
    static BIGINT_28 = BigInt(28);
    static BIGINT_30 = BigInt(30);
    static BIGINT_31 = BigInt(31);
    static BIGINT_32 = BigInt(32);
    static BIGINT_49 = BigInt(49);
    static BIGINT_64 = BigInt(64);
    static STAFFORD_1 = BigInt('-4658895280553007687');
    static STAFFORD_2 = BigInt('-7723592293110705685');
    static MAX_ULONG = BigInt('0xFFFFFFFFFFFFFFFF');
    static POW2_60 = BigInt('0x10000000000000000');
    static POW2_63 = BigInt('0x8000000000000000');
    static MAX_UINT = BigInt(0xFFFFFFFF);
    seed = [BigInt(0), BigInt(0)];
    constructor(seed) {
        this.seed = seed;
    }
    static create(seed) {
        return new XoroshiroRandom(XoroshiroRandom.upgradeSeedTo128bit(seed));
    }
    static mixStafford13(value) {
        value = ((value ^ value >> XoroshiroRandom.BIGINT_30) * XoroshiroRandom.STAFFORD_1) & XoroshiroRandom.MAX_ULONG;
        value = ((value ^ value >> XoroshiroRandom.BIGINT_27) * XoroshiroRandom.STAFFORD_2) & XoroshiroRandom.MAX_ULONG;
        return (value ^ value >> XoroshiroRandom.BIGINT_31) & XoroshiroRandom.MAX_ULONG;
    }
    static upgradeSeedTo128bit(seed) {
        if (seed < 0) {
            seed += XoroshiroRandom.POW2_60;
        }
        const seedLo = seed ^ XoroshiroRandom.SILVER_RATIO_64;
        const seedHi = (seedLo + XoroshiroRandom.GOLDEN_RATIO_64) & XoroshiroRandom.MAX_ULONG;
        return [XoroshiroRandom.mixStafford13(seedLo), XoroshiroRandom.mixStafford13(seedHi)];
    }
    static rotateLeft(value, shift) {
        return (value << shift) & (XoroshiroRandom.MAX_ULONG) | (value >> (XoroshiroRandom.BIGINT_64 - shift));
    }
    setSeed(seed) {
        this.seed = XoroshiroRandom.upgradeSeedTo128bit(seed);
    }
    fork() {
        return new XoroshiroRandom([this.next(), this.next()]);
    }
    forkPositional() {
        return new XoroshiroPositionalRandom(this.next(), this.next());
    }
    next() {
        const seedLo = this.seed[0];
        let seedHi = this.seed[1];
        const value = (XoroshiroRandom.rotateLeft((seedLo + seedHi) & XoroshiroRandom.MAX_ULONG, XoroshiroRandom.BIGINT_17) + seedLo) & XoroshiroRandom.MAX_ULONG;
        seedHi ^= seedLo;
        this.seed = [
            XoroshiroRandom.rotateLeft(seedLo, XoroshiroRandom.BIGINT_49) ^ seedHi ^ ((seedHi << XoroshiroRandom.BIGINT_21) & XoroshiroRandom.MAX_ULONG),
            XoroshiroRandom.rotateLeft(seedHi, XoroshiroRandom.BIGINT_28),
        ];
        return value;
    }
    nextLong() {
        let value = this.next();
        if (value > XoroshiroRandom.POW2_63)
            value -= XoroshiroRandom.POW2_60;
        return value;
    }
    consume(count) {
        let seedLo = this.seed[0];
        let seedHi = this.seed[1];
        for (let i = 0; i < count; i += 1) {
            seedHi ^= seedLo;
            seedLo = XoroshiroRandom.rotateLeft(seedLo, XoroshiroRandom.BIGINT_49) ^ seedHi ^ seedHi << XoroshiroRandom.BIGINT_21;
            seedHi = XoroshiroRandom.rotateLeft(seedHi, XoroshiroRandom.BIGINT_28);
        }
        this.seed = [seedLo, seedHi];
    }
    nextBits(bits) {
        return this.next() >> (BigInt(64 - bits));
    }
    nextInt(max) {
        let value = this.next() & XoroshiroRandom.MAX_UINT;
        if (!max) {
            let result = Number(value);
            if (result >= 0x80000000) {
                result -= 0x100000000;
            }
            return result;
        }
        else {
            const maxBigint = BigInt(max);
            let product = value * maxBigint;
            let productLo = product & XoroshiroRandom.MAX_UINT;
            if (productLo < maxBigint) {
                const newMax = ((~maxBigint & XoroshiroRandom.MAX_UINT) + XoroshiroRandom.BIGINT_1) % maxBigint;
                while (productLo < newMax) {
                    value = this.next() & XoroshiroRandom.MAX_UINT;
                    product = value * maxBigint;
                    productLo = product & XoroshiroRandom.MAX_UINT;
                }
            }
            const productHi = product >> XoroshiroRandom.BIGINT_32;
            return Number(productHi);
        }
    }
    nextFloat() {
        return Number(this.nextBits(24)) * XoroshiroRandom.FLOAT_MULTIPLIER;
    }
    nextDouble() {
        return Number(this.nextBits(53)) * XoroshiroRandom.DOUBLE_MULTIPLIER;
    }
    parityConfigString() {
        return 'seedLo: ' + this.seed[0] + ', seedHi: ' + this.seed[1];
    }
}
export class XoroshiroPositionalRandom {
    seedLo;
    seedHi;
    constructor(seedLo, seedHi) {
        this.seedLo = seedLo;
        this.seedHi = seedHi;
    }
    at(x, y, z) {
        const positionSeed = getSeed(x, y, z);
        const seedLo = positionSeed ^ this.seedLo;
        return new XoroshiroRandom([seedLo, this.seedHi]);
    }
    fromHashOf(name) {
        const hash = md5(name, { asBytes: true });
        const lo = longfromBytes(hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]);
        const hi = longfromBytes(hash[8], hash[9], hash[10], hash[11], hash[12], hash[13], hash[14], hash[15]);
        return new XoroshiroRandom([lo ^ this.seedLo, hi ^ this.seedHi]);
    }
    seedKey() {
        return [this.seedLo, this.seedHi];
    }
}
//# sourceMappingURL=XoroshiroRandom.js.map