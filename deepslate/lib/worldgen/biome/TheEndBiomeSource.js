import { Identifier } from '../../core/index.js';
import { DensityFunction } from '../DensityFunction.js';
export class TheEndBiomeSource {
    static END = Identifier.create('the_end');
    static HIGHLANDS = Identifier.create('end_highlands');
    static MIDLANDS = Identifier.create('end_midlands');
    static ISLANDS = Identifier.create('small_end_islands');
    static BARRENS = Identifier.create('end_barrens');
    getBiome(x, y, z, climateSampler) {
        const blockX = x << 2;
        const blockY = y << 2;
        const blockZ = z << 2;
        const sectionX = blockX >> 4;
        const sectionZ = blockZ >> 4;
        if (sectionX * sectionX + sectionZ * sectionZ <= 4096) {
            return TheEndBiomeSource.END;
        }
        const context = DensityFunction.context((sectionX * 2 + 1) * 8, blockY, (sectionZ * 2 + 1) * 8);
        const erosion = climateSampler.erosion.compute(context);
        if (erosion > 0.25) {
            return TheEndBiomeSource.HIGHLANDS;
        }
        else if (erosion >= -0.0625) {
            return TheEndBiomeSource.MIDLANDS;
        }
        else if (erosion >= -0.21875) {
            return TheEndBiomeSource.BARRENS;
        }
        else {
            return TheEndBiomeSource.ISLANDS;
        }
    }
    static fromJson(obj) {
        return new TheEndBiomeSource();
    }
}
//# sourceMappingURL=TheEndBiomeSource.js.map