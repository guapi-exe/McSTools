import { mat3 } from 'gl-matrix';
export class Matrix3 {
    data;
    constructor(data) {
        this.data = data ?? mat3.create();
    }
    static fromMatrix4(source) {
        return new Matrix3(mat3.fromMat4(mat3.create(), source.data));
    }
    static fromQuat(source) {
        return new Matrix3(mat3.fromQuat(mat3.create(), source));
    }
    clone() {
        return new Matrix3(mat3.clone(this.data));
    }
    copy(other) {
        mat3.copy(this.data, other.data);
        return this;
    }
    translate(a) {
        mat3.translate(this.data, this.data, Array.isArray(a) ? a : [a.x, a.y]);
        return this;
    }
    scale(a) {
        if (typeof a === 'number') {
            mat3.multiplyScalar(this.data, this.data, a);
        }
        else {
            mat3.scale(this.data, this.data, Array.isArray(a) ? a : [a.x, a.y]);
        }
        return this;
    }
    add(other) {
        mat3.add(this.data, this.data, other.data);
        return this;
    }
    sub(other) {
        mat3.sub(this.data, this.data, other.data);
        return this;
    }
    mul(other) {
        mat3.mul(this.data, this.data, other.data);
        return this;
    }
    transpose() {
        mat3.transpose(this.data, this.data);
        return this;
    }
    invert() {
        mat3.invert(this.data, this.data);
        return this;
    }
    get m00() { return this.data[0]; }
    get m01() { return this.data[1]; }
    get m02() { return this.data[2]; }
    get m10() { return this.data[3]; }
    get m11() { return this.data[4]; }
    get m12() { return this.data[5]; }
    get m20() { return this.data[6]; }
    get m21() { return this.data[7]; }
    get m22() { return this.data[8]; }
    set m00(x) { this.data[0] = x; }
    set m01(x) { this.data[1] = x; }
    set m02(x) { this.data[2] = x; }
    set m10(x) { this.data[3] = x; }
    set m11(x) { this.data[4] = x; }
    set m12(x) { this.data[5] = x; }
    set m20(x) { this.data[6] = x; }
    set m21(x) { this.data[7] = x; }
    set m22(x) { this.data[8] = x; }
    toString() {
        return mat3.str(this.data);
    }
}
//# sourceMappingURL=Matrix3.js.map