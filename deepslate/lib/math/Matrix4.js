import { mat4, vec3 } from 'gl-matrix';
import { Vector } from './Vector.js';
export class Matrix4 {
    data;
    constructor(data) {
        this.data = data ?? mat4.create();
    }
    static fromQuat(source) {
        return new Matrix4(mat4.fromQuat(mat4.create(), source));
    }
    clone() {
        return new Matrix4(mat4.clone(this.data));
    }
    translate(a) {
        mat4.translate(this.data, this.data, Array.isArray(a) ? a : a.components());
        return this;
    }
    scale(a) {
        if (typeof a === 'number') {
            mat4.multiplyScalar(this.data, this.data, a);
        }
        else {
            mat4.scale(this.data, this.data, Array.isArray(a) ? a : a.components());
        }
        return this;
    }
    add(other) {
        mat4.add(this.data, this.data, other.data);
        return this;
    }
    sub(other) {
        mat4.sub(this.data, this.data, other.data);
        return this;
    }
    mul(other) {
        mat4.mul(this.data, this.data, other.data);
        return this;
    }
    transpose() {
        mat4.transpose(this.data, this.data);
        return this;
    }
    invert() {
        mat4.invert(this.data, this.data);
        return this;
    }
    affine() {
        return this.scale(1 / this.m33);
    }
    get m00() { return this.data[0]; }
    get m01() { return this.data[1]; }
    get m02() { return this.data[2]; }
    get m03() { return this.data[3]; }
    get m10() { return this.data[4]; }
    get m11() { return this.data[5]; }
    get m12() { return this.data[6]; }
    get m13() { return this.data[7]; }
    get m20() { return this.data[8]; }
    get m21() { return this.data[9]; }
    get m22() { return this.data[10]; }
    get m23() { return this.data[11]; }
    get m30() { return this.data[12]; }
    get m31() { return this.data[13]; }
    get m32() { return this.data[14]; }
    get m33() { return this.data[15]; }
    set m00(x) { this.data[0] = x; }
    set m01(x) { this.data[1] = x; }
    set m02(x) { this.data[2] = x; }
    set m03(x) { this.data[3] = x; }
    set m10(x) { this.data[4] = x; }
    set m11(x) { this.data[5] = x; }
    set m12(x) { this.data[6] = x; }
    set m13(x) { this.data[7] = x; }
    set m20(x) { this.data[8] = x; }
    set m21(x) { this.data[9] = x; }
    set m22(x) { this.data[10] = x; }
    set m23(x) { this.data[11] = x; }
    set m30(x) { this.data[12] = x; }
    set m31(x) { this.data[13] = x; }
    set m32(x) { this.data[14] = x; }
    set m33(x) { this.data[15] = x; }
    getTranslation() {
        const [x, y, z] = mat4.getTranslation(vec3.create(), this.data);
        return new Vector(x, y, z);
    }
    toString() {
        return mat4.str(this.data);
    }
}
//# sourceMappingURL=Matrix4.js.map