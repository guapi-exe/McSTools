import { BlockPos, Holder, HolderSet, Identifier } from '../../core/index.js';
import { LegacyRandom } from '../../math/index.js';
import { Json } from '../../util/index.js';
import { BiomeSource } from '../biome/index.js';
import { WorldgenRegistries } from '../WorldgenRegistries.js';
import { StructureSet } from './StructureSet.js';
export class StructurePlacement {
    locateOffset;
    frequencyReductionMethod;
    frequency;
    salt;
    exclusionZone;
    constructor(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone) {
        this.locateOffset = locateOffset;
        this.frequencyReductionMethod = frequencyReductionMethod;
        this.frequency = frequency;
        this.salt = salt;
        this.exclusionZone = exclusionZone;
    }
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        const locateOffset = BlockPos.fromJson(root.locate_offset);
        const frequencyReductionMethod = StructurePlacement.FrequencyReducer.fromType(Json.readString(root.frequency_reduction_method) ?? 'default');
        const frequency = Json.readNumber(root.frequency) ?? 1;
        const salt = Json.readInt(root.salt) ?? 0;
        const exclusionZone = 'exclusion_zone' in root ? StructurePlacement.ExclusionZone.fromJson(root.exclusion_zone) : undefined;
        switch (type) {
            case 'random_spread':
                const spacing = Json.readInt(root.spacing) ?? 1;
                const separation = Json.readInt(root.separation) ?? 1;
                const spreadType = StructurePlacement.SpreadType.fromJson(root.spread_type);
                return new StructurePlacement.RandomSpreadStructurePlacement(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone, spacing, separation, spreadType);
            case 'concentric_rings':
                const distance = Json.readInt(root.distance) ?? 1;
                const spread = Json.readInt(root.spread) ?? 1;
                const count = Json.readInt(root.count) ?? 1;
                const preferredBiomes = HolderSet.parser(WorldgenRegistries.BIOME)(root.preferred_biomes);
                return new StructurePlacement.ConcentricRingsStructurePlacement(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone, distance, spread, count, preferredBiomes);
        }
        return new StructurePlacement.RandomSpreadStructurePlacement([0, 0, 0], StructurePlacement.FrequencyReducer.ProbabilityReducer, 1, 0, undefined, 1, 1, 'linear');
    }
    isStructureChunk(seed, chunkX, chunkZ) {
        if (!this.isPlacementChunk(seed, chunkX, chunkZ)) {
            return false;
        }
        else if (this.frequency < 1.0 && !this.frequencyReductionMethod(seed, this.salt, chunkX, chunkZ, this.frequency)) {
            return false;
        }
        else if (this.exclusionZone && this.exclusionZone.isPlacementForbidden(seed, chunkX, chunkZ)) {
            return false;
        }
        else {
            return true;
        }
    }
    prepare(_biomeSource, _sampler, _concentricRingsSeed) { }
}
(function (StructurePlacement) {
    let FrequencyReducer;
    (function (FrequencyReducer) {
        function fromType(type) {
            switch (type) {
                case 'legacy_type_1': return LegacyPillagerOutpostReducer;
                case 'legacy_type_2': return LegacyArbitrarySaltProbabilityReducer;
                case 'legacy_type_3': return LegacyProbabilityReducerWithDouble;
                case 'default':
                default: return ProbabilityReducer;
            }
        }
        FrequencyReducer.fromType = fromType;
        function ProbabilityReducer(seed, salt, chunkX, chunkZ, frequency) {
            const random = LegacyRandom.fromLargeFeatureWithSalt(seed, salt, chunkX, chunkZ); // [sic]
            return random.nextFloat() < frequency;
        }
        FrequencyReducer.ProbabilityReducer = ProbabilityReducer;
        function LegacyProbabilityReducerWithDouble(seed, _, chunkX, chunkZ, frequency) {
            const random = LegacyRandom.fromLargeFeatureSeed(seed, chunkX, chunkZ);
            return random.nextDouble() < frequency;
        }
        FrequencyReducer.LegacyProbabilityReducerWithDouble = LegacyProbabilityReducerWithDouble;
        function LegacyArbitrarySaltProbabilityReducer(seed, _, chunkX, chunkZ, frequency) {
            const random = LegacyRandom.fromLargeFeatureWithSalt(seed, chunkX, chunkZ, 10387320);
            return random.nextFloat() < frequency;
        }
        FrequencyReducer.LegacyArbitrarySaltProbabilityReducer = LegacyArbitrarySaltProbabilityReducer;
        function LegacyPillagerOutpostReducer(seed, _, chunkX, chunkZ, frequency) {
            const a = chunkX >> 4;
            const b = chunkZ >> 4;
            const random = new LegacyRandom(BigInt(a ^ b << 4) ^ seed);
            random.nextInt();
            return random.nextInt(Math.floor(1 / frequency)) === 0;
        }
        FrequencyReducer.LegacyPillagerOutpostReducer = LegacyPillagerOutpostReducer;
    })(FrequencyReducer = StructurePlacement.FrequencyReducer || (StructurePlacement.FrequencyReducer = {}));
    class ExclusionZone {
        otherSet;
        chunkCount;
        constructor(otherSet, chunkCount) {
            this.otherSet = otherSet;
            this.chunkCount = chunkCount;
        }
        static fromJson(obj) {
            const root = Json.readObject(obj) ?? {};
            return new ExclusionZone(Holder.reference(StructureSet.REGISTRY, Identifier.parse(Json.readString(root.other_set) ?? '')), Json.readInt(root.chunk_count) ?? 1);
        }
        isPlacementForbidden(seed, chunkX, chunkZ) {
            const placement = this.otherSet.value().placement;
            return placement
                .getPotentialStructureChunks(seed, chunkX - this.chunkCount, chunkZ - this.chunkCount, chunkX + this.chunkCount, chunkZ + this.chunkCount)
                .findIndex((chunk) => Math.abs(chunk[0] - chunkX) <= this.chunkCount && Math.abs(chunk[1] - chunkZ) <= this.chunkCount && placement.isStructureChunk(seed, chunk[0], chunk[1])) >= 0;
        }
    }
    StructurePlacement.ExclusionZone = ExclusionZone;
    let SpreadType;
    (function (SpreadType) {
        function fromJson(obj) {
            const string = Json.readString(obj) ?? 'linear';
            if (string === 'triangular')
                return 'triangular';
            return 'linear';
        }
        SpreadType.fromJson = fromJson;
    })(SpreadType = StructurePlacement.SpreadType || (StructurePlacement.SpreadType = {}));
    class RandomSpreadStructurePlacement extends StructurePlacement {
        spacing;
        separation;
        spreadType;
        constructor(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone, spacing, separation, spreadType) {
            super(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone);
            this.spacing = spacing;
            this.separation = separation;
            this.spreadType = spreadType;
        }
        evaluateSpread(random, max) {
            switch (this.spreadType) {
                case 'linear':
                    return random.nextInt(max);
                case 'triangular':
                    return Math.floor((random.nextInt(max) + random.nextInt(max)) / 2);
            }
        }
        getPotentialStructureChunk(seed, chunkX, chunkZ) {
            const x = Math.floor(chunkX / this.spacing);
            const z = Math.floor(chunkZ / this.spacing);
            const random = LegacyRandom.fromLargeFeatureWithSalt(seed, x, z, this.salt);
            const maxOffset = this.spacing - this.separation;
            const offsetX = this.evaluateSpread(random, maxOffset);
            const offsetZ = this.evaluateSpread(random, maxOffset);
            return [x * this.spacing + offsetX, z * this.spacing + offsetZ];
        }
        isPlacementChunk(seed, chunkX, chunkZ) {
            const [placementX, palcementZ] = this.getPotentialStructureChunk(seed, chunkX, chunkZ);
            return placementX === chunkX && palcementZ === chunkZ;
        }
        getPotentialStructureChunks(seed, minChunkX, minChunkZ, maxChunkX, maxChunkZ) {
            const positions = [];
            for (let chunkX = Math.floor(minChunkX / this.spacing) * this.spacing; chunkX <= maxChunkX; chunkX += this.spacing) {
                for (let chunkZ = Math.floor(minChunkZ / this.spacing) * this.spacing; chunkZ <= maxChunkZ; chunkZ += this.spacing) {
                    positions.push(this.getPotentialStructureChunk(seed, chunkX, chunkZ));
                }
            }
            return positions;
        }
    }
    StructurePlacement.RandomSpreadStructurePlacement = RandomSpreadStructurePlacement;
    const SEARCH_RANGE = 112;
    class ConcentricRingsStructurePlacement extends StructurePlacement {
        distance;
        spread;
        count;
        preferredBiomes;
        positions;
        constructor(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone, distance, spread, count, preferredBiomes) {
            super(locateOffset, frequencyReductionMethod, frequency, salt, exclusionZone);
            this.distance = distance;
            this.spread = spread;
            this.count = count;
            this.preferredBiomes = preferredBiomes;
        }
        prepare(biomeSource, sampler, concentricRingsSeed) {
            if (this.positions !== undefined) {
                return;
            }
            this.positions = [];
            if (this.count === 0) {
                return;
            }
            const random = new LegacyRandom(concentricRingsSeed);
            var angle = random.nextDouble() * Math.PI * 2;
            var current_spread = this.spread;
            var ringNr = 0;
            var posInRingNr = 0;
            const preferredBiomes = [...this.preferredBiomes.value().getEntries()].flatMap(b => b.key() ?? []);
            for (var i = 0; i < this.count; i++) {
                const current_distance = 4 * this.distance + this.distance * ringNr * 6 + (random.nextDouble() - 0.5) * this.distance * 2.5;
                const chunkX = Math.round(Math.cos(angle) * current_distance);
                const chunkZ = Math.round(Math.sin(angle) * current_distance);
                const posX = (chunkX << 4) + 8;
                const posZ = (chunkZ << 4) + 8;
                const forkedRandom = random.fork();
                const provider = () => {
                    const searchResult = BiomeSource.findBiomeHorizontal(biomeSource, posX, 0, posZ, SEARCH_RANGE, (biome) => preferredBiomes.findIndex(b => b.equals(biome)) >= 0, forkedRandom, sampler);
                    if (searchResult) {
                        return [searchResult.pos[0] >> 4, searchResult.pos[2] >> 4];
                    }
                    else {
                        return [chunkX, chunkZ];
                    }
                };
                this.positions.push({ center: [chunkX, chunkZ], real: provider });
                angle += Math.PI * 2 / current_spread;
                posInRingNr++;
                if (posInRingNr == current_spread) {
                    ringNr++;
                    posInRingNr = 0;
                    current_spread += 2 * current_spread / (ringNr + 1);
                    current_spread = Math.min(current_spread, this.count - i);
                    angle += random.nextDouble() * Math.PI * 2;
                }
            }
        }
        isPlacementChunk(seed, chunkX, chunkZ) {
            if (this.positions === undefined) {
                console.warn('trying to access concentric rings placement before position calculation');
                return false;
            }
            return this.getPotentialStructureChunks(seed, chunkX, chunkZ, chunkX, chunkZ).findIndex((p) => p[0] === chunkX && p[1] === chunkZ) >= 0;
        }
        getPotentialStructureChunks(seed, minChunkX, minChunkZ, maxChunkX, maxChunkZ) {
            if (this.positions === undefined) {
                console.warn('trying to access concentric rings placement before position calculation');
                return [];
            }
            const results = [];
            for (const position of this.positions) {
                if (position.center[0] < minChunkX - (SEARCH_RANGE >> 4))
                    continue;
                if (position.center[0] > maxChunkX + (SEARCH_RANGE >> 4))
                    continue;
                if (position.center[1] < minChunkZ - (SEARCH_RANGE >> 4))
                    continue;
                if (position.center[1] > maxChunkZ + (SEARCH_RANGE >> 4))
                    continue;
                if (position.real instanceof Function) {
                    position.real = position.real();
                }
                results.push(position.real);
            }
            return results;
        }
    }
    StructurePlacement.ConcentricRingsStructurePlacement = ConcentricRingsStructurePlacement;
})(StructurePlacement || (StructurePlacement = {}));
//# sourceMappingURL=StructurePlacement.js.map