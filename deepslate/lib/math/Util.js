const MIN_INT = -2147483648;
const MAX_INT = 2147483647;
const MIN_LONG = -9223372036854776000;
const MAX_LONG = 9223372036854776000;
export function square(x) {
    return x * x;
}
export function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}
export function lerp(a, b, c) {
    return b + a * (c - b);
}
export function floatLerp(a, b, c) {
    return Math.fround(b + Math.fround(a * Math.fround(c - b)));
}
export function lerp2(a, b, c, d, e, f) {
    return lerp(b, lerp(a, c, d), lerp(a, e, f));
}
export function lerp3(a, b, c, d, e, f, g, h, i, j, k) {
    return lerp(c, lerp2(a, b, d, e, f, g), lerp2(a, b, h, i, j, k));
}
export function lazyLerp(a, b, c) {
    if (a === 0)
        return b();
    if (a === 1)
        return c();
    return b() + a * (c() - b());
}
export function lazyLerp2(a, b, c, d, e, f) {
    return lazyLerp(b, () => lazyLerp(a, c, d), () => lazyLerp(a, e, f));
}
export function lazyLerp3(a, b, c, d, e, f, g, h, i, j, k) {
    return lazyLerp(c, () => lazyLerp2(a, b, d, e, f, g), () => lazyLerp2(a, b, h, i, j, k));
}
export function clampedLerp(a, b, c) {
    if (c < 0) {
        return a;
    }
    else if (c > 1) {
        return b;
    }
    else {
        return lerp(c, a, b);
    }
}
export function inverseLerp(a, b, c) {
    return (a - b) / (c - b);
}
export function smoothstep(x) {
    return x * x * x * (x * (x * 6 - 15) + 10);
}
export function map(a, b, c, d, e) {
    return lerp(inverseLerp(a, b, c), d, e);
}
export function clampedMap(a, b, c, d, e) {
    return clampedLerp(d, e, inverseLerp(a, b, c));
}
export function intFloor(a) {
    return clamp(Math.floor(a), MIN_INT, MAX_INT);
}
export function longFloor(a) {
    return clamp(Math.floor(a), MIN_LONG, MAX_LONG);
}
export function binarySearch(n, n2, predicate) {
    let n3 = n2 - n;
    while (n3 > 0) {
        const n4 = Math.floor(n3 / 2);
        const n5 = n + n4;
        if (predicate(n5)) {
            n3 = n4;
            continue;
        }
        n = n5 + 1;
        n3 -= n4 + 1;
    }
    return n;
}
export function getSeed(x, y, z) {
    let seed = BigInt(x * 3129871) ^ BigInt(z) * BigInt(116129781) ^ BigInt(y);
    seed = seed * seed * BigInt(42317861) + seed * BigInt(11);
    return seed >> BigInt(16);
}
export function longfromBytes(a, b, c, d, e, f, g, h) {
    return BigInt(a) << BigInt(56)
        | BigInt(b) << BigInt(48)
        | BigInt(c) << BigInt(40)
        | BigInt(d) << BigInt(32)
        | BigInt(e) << BigInt(24)
        | BigInt(f) << BigInt(16)
        | BigInt(g) << BigInt(8)
        | BigInt(h);
}
export function isPowerOfTwo(x) {
    return (x & (x - 1)) === 0;
}
export function upperPowerOfTwo(x) {
    x -= 1;
    x |= x >> 1;
    x |= x >> 2;
    x |= x >> 4;
    x |= x >> 8;
    x |= x >> 18;
    x |= x >> 32;
    return x + 1;
}
export function randomBetweenInclusive(random, min, max) {
    return random.nextInt(max - min + 1) + min;
}
export function nextInt(random, min, max) {
    return min >= max ? min : random.nextInt(max - min + 1) + min;
}
export function shuffle(array, random) {
    for (var i = array.length; i > 1; i--) {
        const switchIndex = random.nextInt(i);
        const tmp = array[switchIndex];
        array[switchIndex] = array[i - 1];
        array[i - 1] = tmp;
    }
}
//# sourceMappingURL=Util.js.map