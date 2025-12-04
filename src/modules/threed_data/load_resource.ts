import {join, resolveResource} from '@tauri-apps/api/path';
import { readTextFile, readDir, readFile } from '@tauri-apps/plugin-fs';
import {
    BlockDefinition,
    BlockModel,
    Identifier,
    TextureAtlas,
    upperPowerOfTwo
} from "deepslate";
import {blocks_resources} from "./deepslateInit.ts";
export const blockIconSpriteMap: Record<string, { atlasUrl: string, uv: [number, number, number, number] }> = {};

interface ConfigData {
    namespace: string;
    blockCount: number;
    itemCount: number;
}

interface OpaqueBlocksData {
    opaque: string[];
}

interface ResourceData {
    namespace: string;
    blockDefinitions: Record<string, BlockDefinition>;
    blockModels: Record<string, BlockModel>;
    textureAtlas: TextureAtlas;
    atlasImage: ImageData;
    atlasSize: number;
    rawUvMap: Record<string, [number, number, number, number]>;
    opaqueBlocks: Set<string>;
    iconAtlasUrl?: string;
    iconUvMap?: Record<string, [number, number, number, number]>;
}

/**
 * 加载单个模组的资源
 */
async function loadModResource(modName: string): Promise<ResourceData | null> {
    try {
        const modPath = await resolveResource(`data/resource/${modName}`);
        
        const configPath = await join(modPath, 'config.json');
        const configText = await readTextFile(configPath);
        const config: ConfigData = JSON.parse(configText);
        
        const assetsPath = await join(modPath, 'assets');
        
        const blockDefPath = await join(assetsPath, 'block_definition/data.min.json');
        const blockDefText = await readTextFile(blockDefPath);
        const blockstates = JSON.parse(blockDefText);
        
        const modelsPath = await join(assetsPath, 'model/data.min.json');
        const modelsText = await readTextFile(modelsPath);
        const models = JSON.parse(modelsText);
        
        const atlasPath = await join(assetsPath, 'atlas/data.min.json');
        const atlasText = await readTextFile(atlasPath);
        const uvMap = JSON.parse(atlasText);
        
        const opaquePath = await join(assetsPath, 'opaque/blocks.json');
        const opaqueText = await readTextFile(opaquePath);
        const opaqueData: OpaqueBlocksData = JSON.parse(opaqueText);
        
        const atlasImgPath = await join(assetsPath, 'atlas/atlas.png');
        const atlasImgData = await readFile(atlasImgPath);
        const atlasBlob = new Blob([new Uint8Array(atlasImgData)], { type: 'image/png' });
        const atlasUrl = URL.createObjectURL(atlasBlob);
        
        const atlasImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(atlasUrl);
                resolve(image);
            };
            image.onerror = reject;
            image.src = atlasUrl;
        });
        
        const blockDefinitions: Record<string, BlockDefinition> = {};
        Object.keys(blockstates).forEach(id => {
            const fullId = `${config.namespace}:${id}`;
            blockDefinitions[fullId] = BlockDefinition.fromJson(blockstates[id]);
        });
        
        const blockModels: Record<string, BlockModel> = {};
        Object.keys(models).forEach(id => {
            const fullId =`${config.namespace}:${id}`;
            blockModels[fullId] = BlockModel.fromJson(models[id]);
        });
        
        const atlasSize = upperPowerOfTwo(Math.max(atlasImage.width, atlasImage.height));
        
        let atlasData: ImageData;
        if (typeof OffscreenCanvas !== 'undefined') {
            const offscreen = new OffscreenCanvas(atlasSize, atlasSize);
            const ctx = offscreen.getContext('2d')!;
            ctx.drawImage(atlasImage, 0, 0);
            atlasData = ctx.getImageData(0, 0, atlasSize, atlasSize);
        } else {
            const atlasCanvas = document.createElement('canvas');
            atlasCanvas.width = atlasSize;
            atlasCanvas.height = atlasSize;
            const atlasCtx = atlasCanvas.getContext('2d')!;
            atlasCtx.drawImage(atlasImage, 0, 0);
            atlasData = atlasCtx.getImageData(0, 0, atlasSize, atlasSize);
        }
        
        const rawUvMap: Record<string, [number, number, number, number]> = {};
        Object.keys(uvMap).forEach(id => {
            const [u, v, du, dv] = uvMap[id];
            const dv2 = (du !== dv && id.startsWith('block/')) ? du : dv;
            const fullId = new Identifier(config.namespace, id).toString();
            rawUvMap[fullId] = [u, v, u + du, v + dv2];
        });
        
        const idMap: Record<string, [number, number, number, number]> = {};
        Object.entries(rawUvMap).forEach(([id, [u0, v0, u1, v1]]) => {
            idMap[id] = [u0 / atlasSize, v0 / atlasSize, u1 / atlasSize, v1 / atlasSize];
        });
        
        const textureAtlas = new TextureAtlas(atlasData, idMap);
        
        const opaqueBlocks = new Set<string>(
            opaqueData.opaque.map(id => `${config.namespace}:${id}`)
        );
        
        let iconAtlasUrl: string | undefined;
        let iconUvMap: Record<string, [number, number, number, number]> | undefined;
        try {
            const iconsPath = await join(modPath, 'icons');
            const iconDataPath = await join(iconsPath, 'data.min.json');
            const iconDataText = await readTextFile(iconDataPath);
            const iconData = JSON.parse(iconDataText);
            
            const iconAtlasPath = await join(iconsPath, 'atlas.png');
            const iconAtlasImgData = await readFile(iconAtlasPath);
            const iconBlob = new Blob([new Uint8Array(iconAtlasImgData)], { type: 'image/png' });
            iconAtlasUrl = URL.createObjectURL(iconBlob);
            
            const iconImage = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = iconAtlasUrl!;
            });
            
            const iconWidth = iconImage.width;
            const iconHeight = iconImage.height;
            iconUvMap = {};
            Object.entries(iconData).forEach(([id, coords]: [string, any]) => {
                const [x, y, w, h] = coords;
                iconUvMap![id] = [x / iconWidth, y / iconHeight, (x + w) / iconWidth, (y + h) / iconHeight];
            });
        } catch (iconErr) {
            console.warn(`Failed to load icons for ${modName}, will skip:`, iconErr);
        }
        
        return {
            namespace: config.namespace,
            blockDefinitions,
            blockModels,
            textureAtlas,
            atlasImage: atlasData,
            atlasSize,
            rawUvMap,
            opaqueBlocks,
            iconAtlasUrl,
            iconUvMap
        };
        
    } catch (err) {
        console.error(`Failed to load resource for ${modName}:`, err);
        return null;
    }
}

export async function loadResource() {
    try {
        const resourcePath = await resolveResource('data/resource/');
        const resourceDirs = await readDir(resourcePath);
        
        const resourcePromises = resourceDirs
            .filter(dir => dir.isDirectory)
            .map(dir => loadModResource(dir.name));
        
        const resourceResults = await Promise.all(resourcePromises);
        const validResources = resourceResults.filter((r): r is ResourceData => r !== null);
        
        if (validResources.length === 0) {
            console.error('No valid resources loaded');
            return null;
        }
        
        const mergedBlockDefinitions: Record<string, BlockDefinition> = {};
        const mergedBlockModels: Record<string, BlockModel> = {};
        const mergedOpaqueBlocks = new Set<string>();
        
        validResources.forEach(resource => {
            Object.assign(mergedBlockDefinitions, resource.blockDefinitions);
            Object.assign(mergedBlockModels, resource.blockModels);
            resource.opaqueBlocks.forEach(id => mergedOpaqueBlocks.add(id));
        });
        
        let totalArea = 0;
        let maxSize = 0;
        validResources.forEach(r => {
            totalArea += r.atlasSize * r.atlasSize;
            maxSize = Math.max(maxSize, r.atlasSize);
        });
        
        let mergedAtlasSize = maxSize;
        while (mergedAtlasSize * mergedAtlasSize < totalArea) {
            mergedAtlasSize *= 2;
        }
        mergedAtlasSize = Math.min(16384, mergedAtlasSize);

        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = mergedAtlasSize;
        mergedCanvas.height = mergedAtlasSize;
        const mergedCtx = mergedCanvas.getContext('2d')!;
        
        const atlasPositions = new Map<string, { x: number, y: number, size: number }>();
        let currentX = 0;
        let currentY = 0;
        let rowHeight = 0;
        
        const atlasUrlMap: Record<string, string> = {};
        for (let i = 0; i < validResources.length; i++) {
            const resource = validResources[i];
            const atlasData = resource.atlasImage;
            const atlasSize = resource.atlasSize;
            if (!atlasUrlMap[resource.namespace]) {
                const canvas = document.createElement('canvas');
                canvas.width = atlasSize;
                canvas.height = atlasSize;
                const ctx = canvas.getContext('2d')!;
                ctx.putImageData(atlasData, 0, 0);
                atlasUrlMap[resource.namespace] = canvas.toDataURL('image/png');
            }
            if (currentX + atlasSize > mergedAtlasSize) {
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
            }
            if (currentY + atlasSize > mergedAtlasSize) {
                console.error(`Cannot fit ${resource.namespace} atlas! Position (${currentX}, ${currentY}) + size ${atlasSize} exceeds ${mergedAtlasSize}`);
                continue;
            }
            mergedCtx.putImageData(atlasData, currentX, currentY);
            atlasPositions.set(resource.namespace, { x: currentX, y: currentY, size: atlasSize });
            currentX += atlasSize;
            rowHeight = Math.max(rowHeight, atlasSize);
            if (i % 2 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        const mergedAtlasData = mergedCtx.getImageData(0, 0, mergedAtlasSize, mergedAtlasSize);
        
        const mergedUvMap: Record<string, [number, number, number, number]> = {};
        for (let i = 0; i < validResources.length; i++) {
            const resource = validResources[i];
            const pos = atlasPositions.get(resource.namespace)!;
            const entries = Object.entries(resource.rawUvMap);
            for (const [id, [u0, v0, u1, v1]] of entries) {
                mergedUvMap[id] = [
                    (pos.x + u0) / mergedAtlasSize,
                    (pos.y + v0) / mergedAtlasSize,
                    (pos.x + u1) / mergedAtlasSize,
                    (pos.y + v1) / mergedAtlasSize
                ];
            }
            
            if (resource.iconAtlasUrl && resource.iconUvMap) {
                const iconCount = Object.keys(resource.iconUvMap).length;
                console.log(`Loading ${iconCount} icons for ${resource.namespace}`);
                Object.entries(resource.iconUvMap).forEach(([id, uv]) => {
                    blockIconSpriteMap[id] = {
                        atlasUrl: resource.iconAtlasUrl!,
                        uv
                    };
                });
                console.log(`First icon key: ${Object.keys(resource.iconUvMap)[0]}`);
            } else {
                console.warn(`No icons loaded for ${resource.namespace}`);
            }
            
            if (i % 2 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        const mergedTextureAtlas = new TextureAtlas(mergedAtlasData, mergedUvMap);
        Object.values(mergedBlockModels).forEach((model: any) => {
            model.flatten({ 
                getBlockModel: (id: Identifier) => mergedBlockModels[id.toString()] || null 
            });
        });
        blocks_resources.value = {
            getBlockDefinition(id: Identifier) {
                return mergedBlockDefinitions[id.toString()] || null;
            },
            getBlockModel(id: Identifier) {
                return mergedBlockModels[id.toString()] || null;
            },
            getTextureUV(id: Identifier) {
                return mergedTextureAtlas.getTextureUV(id);
            },
            getTextureAtlas() {
                return mergedTextureAtlas.getTextureAtlas();
            },
            getBlockFlags(id: Identifier) {
                return {
                    opaque: mergedOpaqueBlocks.has(id.toString())
                };
            },
            getBlockProperties() {
                return null;
            },
            getDefaultBlockProperties() {
                return {};
            },
            getItemModel() {
                return null
            },
            getItemComponents() {
                return null
            },

        };
        
        console.log(`Loaded ${validResources.length} mod resources:`, 
            validResources.map(r => r.namespace).join(', '));
        console.log(`Total icons in blockIconSpriteMap: ${Object.keys(blockIconSpriteMap).length}`);
        console.log(`Sample icon keys:`, Object.keys(blockIconSpriteMap).slice(0, 3));
        

    } catch (err) {
        console.error('Failed to load resources:', err);
    }
}