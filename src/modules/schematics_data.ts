import {invoke} from '@tauri-apps/api/core';
import {toast} from "./others.ts";

export interface SchematicsData {
    id: number,
    name: string,
    description: string,
    schematic_type: number,
    sub_type: number,
    is_deleted: boolean,
    sizes: string,
    user: string,
    is_upload: boolean,
    version: number,
    version_list: string,
    created_at: string,
    updated_at: string,
    schematic_tags: string,
    game_version: string,
    lm_version: number,
    classification: string,
}

export interface GameVersionOption {
    name: string,
    id: number,
}

export const fetchSchematicGameVersions = async (
    schematicType: number,
    schematicSubType: number,
): Promise<GameVersionOption[]> => {
    try {
        return await invoke<GameVersionOption[]>(
            'get_schematic_game_versions',
            {
                schematicType,
                schematicSubType,
            },
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000,
        });
        throw new Error(`获取游戏版本失败: ${error}`);
    }
}

export let schematicTypeList = {
    1: "香草结构",
    2: "投影蓝图",
    3: "创世神",
    4: "建筑小帮手",
    5: "MC BE",
    6: "创世神旧版",
}
export let schematicTypeListWeb = {
    0: "香草结构",
    1: "投影蓝图",
    2: "建筑小帮手",
    3: "创世神",
    5: "创世神旧版",
    4: "MC BE",

}
interface PaginatedResult<T> {
    data: T[];
    page: number;
    page_size: number;
    total: number;
}
export interface SchematicsParams {
    filter?: string;
    classification?: string;
    page?: number;
    page_size?: number;
    sort_by?: 'created_at' | 'updated_at' | 'name';
    sort_order?: 'asc' | 'desc';
    schematic_type?: number;
    game_version?: string;
}
export const fetchSchematics = async (
    params: SchematicsParams
): Promise<PaginatedResult<SchematicsData>> => {
    try {
        const result = await invoke<PaginatedResult<SchematicsData>>(
            'get_schematics',
            {
                filter: params.filter || '',
                classificationFilter: params.classification || '',
                page: params.page || 1,
                pageSize: params.page_size || 20,
                sortBy: params.sort_by || 'created_at',
                sortOrder: params.sort_order || 'desc',
                schematicType: params.schematic_type ?? -1,
                gameVersion: params.game_version || ''
            }
        );
        return {
            ...result,
            data: result.data.map(item => ({
                ...item,
            }))
        };
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`获取原理图失败: ${error}`);
    }
}
export const fetchSchematic = async (
    id: number
): Promise<SchematicsData> => {
    try {
        return await invoke<SchematicsData>(
            'get_schematic',
            {
                id: id || 1,
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`获取原理图失败: ${error}`);
    }
}

export const fetchSchematicCount = async (
    classification: string,
    filter = ''
): Promise<number> => {
    try {
        return await invoke<number>(
            'count_schematics',
            {
                classificationFilter: classification || '',
                filter: filter || '',
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`获取原理图失败: ${error}`);
    }
}

export const fetchDistinctGameVersions = async (): Promise<string[]> => {
    try {
        return await invoke<string[]>('get_distinct_game_versions')
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`获取游戏版本失败: ${error}`);
    }
}
