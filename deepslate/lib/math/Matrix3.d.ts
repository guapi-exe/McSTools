import type { quat } from 'gl-matrix';
import { mat3 } from 'gl-matrix';
import type { Matrix4 } from './Matrix4.js';
import type { Vector } from './Vector.js';
export declare class Matrix3 {
    data: mat3;
    constructor(data?: mat3);
    static fromMatrix4(source: Matrix4): Matrix3;
    static fromQuat(source: quat): Matrix3;
    clone(): Matrix3;
    copy(other: Matrix3): this;
    translate(a: Vector | [number, number]): this;
    scale(a: Vector | [number, number] | number): this;
    add(other: Matrix3): this;
    sub(other: Matrix3): this;
    mul(other: Matrix3): this;
    transpose(): this;
    invert(): this;
    get m00(): number;
    get m01(): number;
    get m02(): number;
    get m10(): number;
    get m11(): number;
    get m12(): number;
    get m20(): number;
    get m21(): number;
    get m22(): number;
    set m00(x: number);
    set m01(x: number);
    set m02(x: number);
    set m10(x: number);
    set m11(x: number);
    set m12(x: number);
    set m20(x: number);
    set m21(x: number);
    set m22(x: number);
    toString(): string;
}
//# sourceMappingURL=Matrix3.d.ts.map