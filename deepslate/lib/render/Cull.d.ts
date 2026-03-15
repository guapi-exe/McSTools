import type { Direction } from '../core/index.js';
export declare type Cull = {
    [key in Direction]?: boolean;
};
export declare namespace Cull {
    function rotate(cull: Cull, x: number, y: number): {
        up: boolean | undefined;
        down: boolean | undefined;
        north: boolean | undefined;
        east: boolean | undefined;
        south: boolean | undefined;
        west: boolean | undefined;
    };
    function none(): Cull;
}
//# sourceMappingURL=Cull.d.ts.map