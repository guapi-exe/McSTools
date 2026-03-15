import { Vertex } from './Vertex.js';
export class Line {
    v1;
    v2;
    constructor(v1, v2) {
        this.v1 = v1;
        this.v2 = v2;
    }
    vertices() {
        return [this.v1, this.v2];
    }
    forEach(fn) {
        fn(this.v1);
        fn(this.v2);
        return this;
    }
    transform(transformation) {
        this.forEach(v => v.transform(transformation));
        return this;
    }
    translate(x, y, z) {
        this.v1.translate(x, y, z);
        this.v2.translate(x, y, z);
        return this;
    }
    setColor(color) {
        this.forEach(v => v.color = color);
        return this;
    }
    toString() {
        return `Line(${this.v1.pos.toString()}, ${this.v2.pos.toString()})`;
    }
    static fromPoints(p1, p2) {
        return new Line(Vertex.fromPos(p1), Vertex.fromPos(p2));
    }
}
//# sourceMappingURL=Line.js.map