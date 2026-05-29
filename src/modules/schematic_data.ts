import {BlockData, BlockPos} from "./replace_data.ts";
import {invoke} from "@tauri-apps/api/core";
import {toast} from "./others.ts";

export type NbtValue =
    | { type: 'Byte'; value: number }
    | { type: 'Short'; value: number }
    | { type: 'Int'; value: number }
    | { type: 'Long'; value: bigint }
    | { type: 'Float'; value: number }
    | { type: 'Double'; value: number }
    | { type: 'String'; value: string }
    | { type: 'ByteArray'; value: number[] }
    | { type: 'IntArray'; value: number[] }
    | { type: 'LongArray'; value: bigint[] }
    | { type: 'List'; value: NbtValue[] }
    | { type: 'Compound'; value: Record<string, NbtValue> };
export interface BlockStatePos {
    pos: BlockPos,
    block: BlockData,
}
export interface Size {
    width: number,
    height: number,
    length: number,
}
export interface TileEntities {
    pos: BlockPos,
    nbt: NbtValue,
}
export interface BlockStatePosList {
    elements: BlockStatePos[];
}

export interface TileEntitiesList {
    elements: TileEntities[];
}
export interface SchematicData {
    blocks: BlockStatePosList,
    tile_entities_list: TileEntitiesList,
    size: Size,
}

export interface SchematicPreviewBlockState {
    id: string,
    properties: Record<string, string>,
}

export interface SchematicPreviewMaterial {
    id: string,
    count: number,
}

export interface SchematicPreviewData {
    size: Size,
    palette: SchematicPreviewBlockState[],
    blocks: number[],
    materials: SchematicPreviewMaterial[],
    tile_entities_list: TileEntitiesList,
}


export async function fetchSchematicData(
    schematicId: number
): Promise<SchematicData> {
    try {
        return await invoke<SchematicData>('get_schematic_data', {id: schematicId})
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`err: ${error}`);
    }
}

export async function fetchSchematicPreviewData(
    schematicId: number
): Promise<SchematicPreviewData> {
    try {
        return await invoke<SchematicPreviewData>('get_schematic_preview_data', {id: schematicId})
    } catch (error) {
        toast.error(`发生了一个错误: ${error}`, {
            timeout: 3000
        });
        throw new Error(`err: ${error}`);
    }
}
