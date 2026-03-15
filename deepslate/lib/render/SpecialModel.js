import { mat4 } from 'gl-matrix';
import { Identifier, Json, NbtList, SpecialRenderers } from '../index.js';
import { Mesh } from './Mesh.js';
export var SpecialModel;
(function (SpecialModel) {
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        switch (type) {
            case 'bed': return new Bed(Identifier.parse(Json.readString(root.texture) ?? ''));
            case 'banner': return new Banner(Json.readString(root.color) ?? '');
            case 'conduit': return new Conduit();
            case 'chest': return new Chest(Identifier.parse(Json.readString(root.texture) ?? ''), Json.readNumber(root.openness) ?? 0);
            case 'head': return new Head(Json.readString(root.kind) ?? '', typeof root.texture === 'string' ? Identifier.parse(root.texture) : undefined, Json.readNumber(root.animation) ?? 0);
            case 'player_head': return new Head('player', undefined, 0);
            case 'shulker_box': return new ShulkerBox(Identifier.parse(Json.readString(root.texture) ?? ''), Json.readNumber(root.openness) ?? 0, (Json.readString(root.orientation) ?? 'up'));
            case 'shield': return new Shield();
            case 'trident': return new Trident();
            case 'decorated_pot': return new DecoratedPot();
            case 'standing_sign': return new StandingSign(Json.readString(root.wood_type) ?? '', typeof root.texture === 'string' ? Identifier.parse(root.texture) : undefined);
            case 'hanging_sign': return new HangingSign(Json.readString(root.wood_type) ?? '', typeof root.texture === 'string' ? Identifier.parse(root.texture) : undefined);
            default:
                console.warn(`[deepslate]: Unknown special model ${type}`);
                return { getMesh: () => new Mesh() };
        }
    }
    SpecialModel.fromJson = fromJson;
    class Bed {
        renderer;
        constructor(texture) {
            this.renderer = SpecialRenderers.bedRenderer(texture);
        }
        getMesh(item, resources) {
            const headMesh = this.renderer('head', resources);
            const footMesh = this.renderer('foot', resources);
            const t = mat4.create();
            mat4.translate(t, t, [0, 0, -16]);
            return headMesh.merge(footMesh.transform(t));
        }
    }
    class Banner {
        renderer;
        constructor(color) {
            this.renderer = SpecialRenderers.bannerRenderer(color);
        }
        getMesh(item, resources) {
            const patterns = item.getComponent('banner_patterns', undefined);
            const t = mat4.create();
            mat4.translate(t, t, [8, 24, 8]);
            mat4.rotateY(t, t, Math.PI);
            mat4.scale(t, t, [2 / 3, 2 / 3, 2 / 3]);
            mat4.translate(t, t, [-8, -24, -8]);
            return this.renderer(resources, patterns instanceof (NbtList) ? patterns : undefined).transform(t);
        }
    }
    class Conduit {
        getMesh(item, resources) {
            return SpecialRenderers.conduitRenderer(resources);
        }
    }
    class Chest {
        renderer;
        constructor(texture, openness) {
            this.renderer = SpecialRenderers.chestRenderer(texture);
        }
        getMesh(item, resources) {
            const t = mat4.create();
            mat4.translate(t, t, [8, 8, 8]);
            mat4.rotateY(t, t, Math.PI);
            mat4.translate(t, t, [-8, -8, -8]);
            return this.renderer(resources).transform(t);
        }
    }
    class Head {
        renderer;
        constructor(kind, texture, animation) {
            this.renderer = ({
                skeleton: () => SpecialRenderers.headRenderer(texture ?? Identifier.create('skeleton/skeleton'), 2),
                wither_skeleton: () => SpecialRenderers.headRenderer(texture ?? Identifier.create('skeleton/wither_skeleton'), 2),
                zombie: () => SpecialRenderers.headRenderer(texture ?? Identifier.create('zombie/zombie'), 1),
                creeper: () => SpecialRenderers.headRenderer(texture ?? Identifier.create('creeper/creeper'), 2),
                dragon: () => SpecialRenderers.dragonHeadRenderer(texture),
                piglin: () => SpecialRenderers.piglinHeadRenderer(texture),
                player: () => SpecialRenderers.headRenderer(texture ?? Identifier.create('player/wide/steve'), 1), // TODO: fix texture
            }[kind] ?? (() => () => new Mesh()))();
        }
        getMesh(item, resources) {
            return this.renderer(resources);
        }
    }
    class ShulkerBox {
        renderer;
        constructor(texture, openness, orientation) {
            this.renderer = SpecialRenderers.shulkerBoxRenderer(texture);
        }
        getMesh(item, resources) {
            return this.renderer(resources);
        }
    }
    class Shield {
        getMesh(item, resources) {
            const shieldMesh = SpecialRenderers.shieldRenderer(resources);
            const t = mat4.create();
            mat4.translate(t, t, [-3, 1, 0]);
            mat4.rotateX(t, t, -10 * Math.PI / 180);
            mat4.rotateY(t, t, -10 * Math.PI / 180);
            mat4.rotateZ(t, t, -5 * Math.PI / 180);
            return shieldMesh.transform(t);
        }
    }
    class Trident {
        getMesh(item, resources) {
            return new Mesh(); // TODO
        }
    }
    class DecoratedPot {
        getMesh(item, resources) {
            return SpecialRenderers.decoratedPotRenderer(resources);
        }
    }
    class StandingSign {
        renderer;
        constructor(wood_type, texture) {
            this.renderer = SpecialRenderers.signRenderer(texture ?? Identifier.create(wood_type));
        }
        getMesh(item, resources) {
            return this.renderer(resources);
        }
    }
    class HangingSign {
        renderer;
        constructor(wood_type, texture) {
            this.renderer = SpecialRenderers.hangingSignRenderer(texture ?? Identifier.create(wood_type));
        }
        getMesh(item, resources) {
            return this.renderer(false, resources);
        }
    }
})(SpecialModel || (SpecialModel = {}));
//# sourceMappingURL=SpecialModel.js.map