import { mat4 } from 'gl-matrix';
import { Identifier } from '../core/index.js';
import { Mesh } from './Mesh.js';
import { Renderer } from './Renderer.js';
export class ItemRenderer extends Renderer {
    item;
    resources;
    mesh;
    atlasTexture;
    constructor(gl, item, resources, context = {}) {
        super(gl);
        this.item = item;
        this.resources = resources;
        this.updateMesh(context);
        this.atlasTexture = this.createAtlasTexture(this.resources.getTextureAtlas());
    }
    setItem(item, context = {}) {
        this.item = item;
        this.updateMesh(context);
    }
    updateMesh(context = {}) {
        this.mesh = ItemRenderer.getItemMesh(this.item, this.resources, context);
        this.mesh.computeNormals();
        this.mesh.rebuild(this.gl, { pos: true, color: true, texture: true, normal: true });
    }
    static getItemMesh(item, resources, context) {
        const itemModelId = item.getComponent('item_model', resources)?.getAsString();
        if (itemModelId === undefined) {
            return new Mesh();
        }
        const itemModel = resources.getItemModel(Identifier.parse(itemModelId));
        if (!itemModel) {
            throw new Error(`Item model ${itemModelId} does not exist (defined by item ${item.toString()})`);
        }
        const mesh = itemModel.getMesh(item, resources, context);
        return mesh;
    }
    getPerspective() {
        const projMatrix = mat4.create();
        mat4.ortho(projMatrix, 0, 16, 0, 16, 0.1, 500.0);
        return projMatrix;
    }
    drawItem() {
        const view = mat4.create();
        mat4.translate(view, view, [0, 0, -32]);
        this.setShader(this.shaderProgram);
        this.setTexture(this.atlasTexture, this.resources.getPixelSize?.());
        this.prepareDraw(view);
        this.drawMesh(this.mesh, { pos: true, color: true, texture: true, normal: true });
    }
}
//# sourceMappingURL=ItemRenderer.js.map