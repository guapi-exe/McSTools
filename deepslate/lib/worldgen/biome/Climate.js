import { square } from '../../math/index.js';
import { Json } from '../../util/index.js';
import { DensityFunction } from '../DensityFunction.js';
export var Climate;
(function (Climate) {
    const PARAMETER_SPACE = 7;
    function target(temperature, humidity, continentalness, erosion, depth, weirdness) {
        return new TargetPoint(temperature, humidity, continentalness, erosion, depth, weirdness);
    }
    Climate.target = target;
    function parameters(temperature, humidity, continentalness, erosion, depth, weirdness, offset) {
        return new ParamPoint(param(temperature), param(humidity), param(continentalness), param(erosion), param(depth), param(weirdness), offset);
    }
    Climate.parameters = parameters;
    function param(value, max) {
        if (typeof value === 'number') {
            return new Param(value, max ?? value);
        }
        return value;
    }
    Climate.param = param;
    class Param {
        min;
        max;
        constructor(min, max) {
            this.min = min;
            this.max = max;
        }
        distance(param) {
            const diffMax = (typeof param === 'number' ? param : param.min) - this.max;
            const diffMin = this.min - (typeof param === 'number' ? param : param.max);
            if (diffMax > 0) {
                return diffMax;
            }
            return Math.max(diffMin, 0);
        }
        union(param) {
            return new Param(Math.min(this.min, param.min), Math.max(this.max, param.max));
        }
        static fromJson(obj) {
            if (typeof obj === 'number')
                return new Param(obj, obj);
            const [min, max] = Json.readArray(obj, e => Json.readNumber(e)) ?? [];
            return new Param(min ?? 0, max ?? 0);
        }
    }
    Climate.Param = Param;
    class ParamPoint {
        temperature;
        humidity;
        continentalness;
        erosion;
        depth;
        weirdness;
        offset;
        constructor(temperature, humidity, continentalness, erosion, depth, weirdness, offset) {
            this.temperature = temperature;
            this.humidity = humidity;
            this.continentalness = continentalness;
            this.erosion = erosion;
            this.depth = depth;
            this.weirdness = weirdness;
            this.offset = offset;
        }
        fittness(point) {
            return square(this.temperature.distance(point.temperature))
                + square(this.humidity.distance(point.humidity))
                + square(this.continentalness.distance(point.continentalness))
                + square(this.erosion.distance(point.erosion))
                + square(this.depth.distance(point.depth))
                + square(this.weirdness.distance(point.weirdness))
                + square(this.offset - point.offset);
        }
        space() {
            return [this.temperature, this.humidity, this.continentalness, this.erosion, this.depth, this.weirdness, new Param(this.offset, this.offset)];
        }
        static fromJson(obj) {
            const root = Json.readObject(obj) ?? {};
            return new ParamPoint(Param.fromJson(root.temperature), Param.fromJson(root.humidity), Param.fromJson(root.continentalness), Param.fromJson(root.erosion), Param.fromJson(root.depth), Param.fromJson(root.weirdness), Json.readNumber(root.offset) ?? 0);
        }
    }
    Climate.ParamPoint = ParamPoint;
    class TargetPoint {
        temperature;
        humidity;
        continentalness;
        erosion;
        depth;
        weirdness;
        constructor(temperature, humidity, continentalness, erosion, depth, weirdness) {
            this.temperature = temperature;
            this.humidity = humidity;
            this.continentalness = continentalness;
            this.erosion = erosion;
            this.depth = depth;
            this.weirdness = weirdness;
        }
        get offset() {
            return 0;
        }
        toArray() {
            return [this.temperature, this.humidity, this.continentalness, this.erosion, this.depth, this.weirdness, this.offset];
        }
    }
    Climate.TargetPoint = TargetPoint;
    class Parameters {
        things;
        index;
        constructor(things) {
            this.things = things;
            this.index = new RTree(things);
        }
        find(target) {
            return this.index.search(target, (node, values) => node.distance(values));
        }
    }
    Climate.Parameters = Parameters;
    class Sampler {
        temperature;
        humidity;
        continentalness;
        erosion;
        depth;
        weirdness;
        constructor(temperature, humidity, continentalness, erosion, depth, weirdness) {
            this.temperature = temperature;
            this.humidity = humidity;
            this.continentalness = continentalness;
            this.erosion = erosion;
            this.depth = depth;
            this.weirdness = weirdness;
        }
        static fromRouter(router) {
            return new Climate.Sampler(router.temperature, router.vegetation, router.continents, router.erosion, router.depth, router.ridges);
        }
        sample(x, y, z) {
            const context = DensityFunction.context(x << 2, y << 2, z << 2);
            return Climate.target(this.temperature.compute(context), this.humidity.compute(context), this.continentalness.compute(context), this.erosion.compute(context), this.depth.compute(context), this.weirdness.compute(context));
        }
    }
    Climate.Sampler = Sampler;
    class RTree {
        static CHILDREN_PER_NODE = 10;
        root;
        last_leaf = null;
        constructor(points) {
            if (points.length === 0) {
                throw new Error('At least one point is required to build search tree');
            }
            this.root = RTree.build(points.map(([point, thing]) => new RLeaf(point, thing)));
        }
        static build(nodes) {
            if (nodes.length === 1) {
                return nodes[0];
            }
            if (nodes.length <= RTree.CHILDREN_PER_NODE) {
                const sortedNodes = nodes
                    .map(node => {
                    let key = 0.0;
                    for (let i = 0; i < PARAMETER_SPACE; i += 1) {
                        const param = node.space[i];
                        key += Math.abs((param.min + param.max) / 2.0);
                    }
                    return { key, node };
                })
                    .sort((a, b) => a.key - b.key)
                    .map(({ node }) => node);
                return new RSubTree(sortedNodes);
            }
            let f = Infinity;
            let n3 = -1;
            let result = [];
            for (let n2 = 0; n2 < PARAMETER_SPACE; ++n2) {
                nodes = RTree.sort(nodes, n2, false);
                result = RTree.bucketize(nodes);
                let f2 = 0.0;
                for (const subTree2 of result) {
                    f2 += RTree.area(subTree2.space);
                }
                if (!(f > f2))
                    continue;
                f = f2;
                n3 = n2;
            }
            nodes = RTree.sort(nodes, n3, false);
            result = RTree.bucketize(nodes);
            result = RTree.sort(result, n3, true);
            return new RSubTree(result.map(subTree => RTree.build(subTree.children)));
        }
        static sort(nodes, i, abs) {
            return nodes
                .map(node => {
                const param = node.space[i];
                const f = (param.min + param.max) / 2;
                const key = abs ? Math.abs(f) : f;
                return { key, node };
            })
                .sort((a, b) => a.key - b.key)
                .map(({ node }) => node);
        }
        static bucketize(nodes) {
            const arrayList = [];
            let arrayList2 = [];
            const n = Math.pow(10.0, Math.floor(Math.log(nodes.length - 0.01) / Math.log(10.0)));
            for (const node of nodes) {
                arrayList2.push(node);
                if (arrayList2.length < n)
                    continue;
                arrayList.push(new RSubTree(arrayList2));
                arrayList2 = [];
            }
            if (arrayList2.length !== 0) {
                arrayList.push(new RSubTree(arrayList2));
            }
            return arrayList;
        }
        static area(params) {
            let f = 0.0;
            for (const param of params) {
                f += Math.abs(param.max - param.min);
            }
            return f;
        }
        search(target, distance) {
            const leaf = this.root.search(target.toArray(), this.last_leaf, distance);
            this.last_leaf = leaf;
            return leaf.thing();
        }
    }
    Climate.RTree = RTree;
    class RNode {
        space;
        constructor(space) {
            this.space = space;
        }
        distance(values) {
            let result = 0;
            for (let i = 0; i < PARAMETER_SPACE; i += 1) {
                result += square(this.space[i].distance(values[i]));
            }
            return result;
        }
    }
    Climate.RNode = RNode;
    class RSubTree extends RNode {
        children;
        constructor(children) {
            super(RSubTree.buildSpace(children));
            this.children = children;
        }
        static buildSpace(nodes) {
            let space = [...Array(PARAMETER_SPACE)].map(() => new Param(Infinity, -Infinity));
            for (const node of nodes) {
                space = [...Array(PARAMETER_SPACE)].map((_, i) => space[i].union(node.space[i]));
            }
            return space;
        }
        search(values, closest_leaf, distance) {
            let dist = closest_leaf ? distance(closest_leaf, values) : Infinity;
            let leaf = closest_leaf;
            for (const node of this.children) {
                const d1 = distance(node, values);
                if (dist <= d1)
                    continue;
                const leaf2 = node.search(values, leaf, distance);
                if (leaf2 === null)
                    continue;
                const d2 = node == leaf2 ? d1 : distance(leaf2, values);
                if (d2 === 0)
                    return leaf2;
                if (dist <= d2)
                    continue;
                dist = d2;
                leaf = leaf2;
            }
            return leaf;
        }
    }
    Climate.RSubTree = RSubTree;
    class RLeaf extends RNode {
        thing;
        constructor(point, thing) {
            super(point.space());
            this.thing = thing;
        }
        search() {
            return this;
        }
    }
    Climate.RLeaf = RLeaf;
})(Climate || (Climate = {}));
//# sourceMappingURL=Climate.js.map