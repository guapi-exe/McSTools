import { nextInt, randomBetweenInclusive } from '../math/index.js';
import { Json } from '../util/index.js';
import { VerticalAnchor } from './VerticalAnchor.js';
export var HeightProvider;
(function (HeightProvider) {
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        switch (type) {
            case undefined: return constant(VerticalAnchor.fromJson(obj));
            case 'constant': return constant(VerticalAnchor.fromJson(root.value));
            case 'uniform': return uniform(VerticalAnchor.fromJson(root.min_inclusive), VerticalAnchor.fromJson(root.max_inclusive));
            case 'biased_to_bottom': return biased_to_bottom(VerticalAnchor.fromJson(root.min_inclusive), VerticalAnchor.fromJson(root.max_inclusive), Json.readInt(root.inner));
            case 'very_biased_to_bottom': return very_biased_to_bottom(VerticalAnchor.fromJson(root.min_inclusive), VerticalAnchor.fromJson(root.max_inclusive), Json.readInt(root.inner));
            case 'trapezoid': return trapezoid(VerticalAnchor.fromJson(root.min_inclusive), VerticalAnchor.fromJson(root.max_inclusive), Json.readInt(root.plateau));
            case 'weighted_list':
                return weighted_list(Json.readArray(root.distribution, (obj) => {
                    const entry = Json.readObject(obj) ?? {};
                    return { weight: Json.readInt(entry.weight) ?? 1, data: fromJson(entry.data) };
                }) ?? []);
        }
        return () => 0;
    }
    HeightProvider.fromJson = fromJson;
    function constant(anchor) {
        return (_, context) => anchor(context);
    }
    HeightProvider.constant = constant;
    function uniform(minInclusive, maxInclusive) {
        return (random, context) => {
            const minY = minInclusive(context);
            const maxY = maxInclusive(context);
            if (minY > maxY) {
                return minY;
            }
            else {
                return random.nextInt(maxY - minY + 1) + minY;
            }
        };
    }
    HeightProvider.uniform = uniform;
    function biased_to_bottom(minInclusive, maxInclusive, inner = 1) {
        return (random, context) => {
            const minY = minInclusive(context);
            const maxY = maxInclusive(context);
            if (maxY - minY - inner + 1 <= 0) {
                return minY;
            }
            else {
                const r = random.nextInt(maxY - minY - inner + 1);
                return random.nextInt(r + inner) + minY;
            }
        };
    }
    HeightProvider.biased_to_bottom = biased_to_bottom;
    function very_biased_to_bottom(minInclusive, maxInclusive, inner = 1) {
        return (random, context) => {
            const minY = minInclusive(context);
            const maxY = maxInclusive(context);
            if (maxY - minY - inner + 1 <= 0) {
                return minY;
            }
            else {
                const r1 = nextInt(random, minY + inner, maxY);
                const r2 = nextInt(random, minY, r1 - 1);
                return nextInt(random, minY, r2 - 1 + inner);
            }
        };
    }
    HeightProvider.very_biased_to_bottom = very_biased_to_bottom;
    function trapezoid(minInclusive, maxInclusive, plateau = 0) {
        return (random, context) => {
            const minY = minInclusive(context);
            const maxY = maxInclusive(context);
            if (minY > maxY) {
                return minY;
            }
            else {
                const range = maxY - minY;
                if (plateau >= range) {
                    return randomBetweenInclusive(random, minY, maxY);
                }
                else {
                    const slope = (range - plateau) / 2;
                    const r = range - slope;
                    return minY + randomBetweenInclusive(random, 0, r) + randomBetweenInclusive(random, 0, slope);
                }
            }
        };
    }
    HeightProvider.trapezoid = trapezoid;
    function weighted_list(distribution) {
        const totalWeight = distribution.reduce((sum, e, i) => sum + e.weight, 0);
        return (random, context) => {
            let r = random.nextInt(totalWeight);
            for (const e of distribution) {
                r -= e.weight;
                if (r <= 0) {
                    return e.data(random, context);
                }
            }
            return 0;
        };
    }
    HeightProvider.weighted_list = weighted_list;
})(HeightProvider || (HeightProvider = {}));
//# sourceMappingURL=HeightProvider.js.map