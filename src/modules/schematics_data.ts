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
export let schematicTypeList = {
    1: "香草结构",
    2: "投影蓝图",
    3: "创世神",
    4: "建筑小帮手",
}
export let schematicTypeListWeb = {
    0: "香草结构",
    1: "投影蓝图",
    2: "建筑小帮手",
    3: "创世神",
    4: "MC BE",

}
interface PaginatedResult<T> {
    data: T[];
    page: number;
    page_size: number;
}
export interface SchematicsParams {
    filter?: string;
    classification?: string;
    page?: number;
    page_size?: number;
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
                pageSize: params.page_size || 20
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
    classification: string
): Promise<number> => {
    try {
        return await invoke<number>(
            'count_schematics',
            {
                classificationFilter: classification || '',
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`获取原理图失败: ${error}`);
    }
}
