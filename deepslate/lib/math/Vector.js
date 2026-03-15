export class Vector {
    x;
    y;
    z;
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
    lengthSquared() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    distance(other) {
        return this.sub(other).length();
    }
    distanceSquared(other) {
        return this.sub(other).lengthSquared();
    }
    abs() {
        return new Vector(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
    }
    add(other) {
        return new Vector(this.x + other.x, this.y + other.y, this.z + other.z);
    }
    sub(other) {
        return new Vector(this.x - other.x, this.y - other.y, this.z - other.z);
    }
    mul(other) {
        return new Vector(this.x * other.x, this.y * other.y, this.z * other.z);
    }
    div(other) {
        return new Vector(this.x / other.x, this.y / other.y, this.z / other.z);
    }
    scale(n) {
        return new Vector(this.x * n, this.y * n, this.z * n);
    }
    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }
    cross(other) {
        const x = this.y * other.z - this.z * other.y;
        const y = this.z * other.x - this.x * other.z;
        const z = this.x * other.y - this.y * other.x;
        return new Vector(x, y, z);
    }
    normalize() {
        if (this.x == 0 && this.y == 0 && this.z == 0) {
            return this;
        }
        const r = 1 / this.length();
        return new Vector(this.x * r, this.y * r, this.z * r);
    }
    components() {
        return [this.x, this.y, this.z];
    }
    toString() {
        return `[${this.x} ${this.y} ${this.z}]`;
    }
}
//# sourceMappingURL=Vector.js.map