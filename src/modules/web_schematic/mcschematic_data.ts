import { fetch } from '@tauri-apps/plugin-http';
import {toast} from "../others.ts";

export interface McSchematicData {
    author: string
    authority: number
    avatarUrl: string
    belong: number
    bgType: number
    description: string
    heat: number
    imgs: string
    models: string
    name: string
    nickName: string
    size: string
    tags: string
    type: number
    updateTime: string
    uploadTime: string
    userPrivate: number
    uuid: string
}

export interface McSchematicsParams {
    filter?: string;
    page?: number;
    sort?: boolean;
    type?: number;
}

export const fetchMcSchematics = async (
    params: McSchematicsParams
): Promise<McSchematicData[]> => {
    try {
        const pageSize = 15;
        const pageNum = (params.page || 0) * pageSize;
        const url = new URL('https://www.mcschematic.top/api/schematics');

        url.searchParams.append('begin', pageNum.toString());
        url.searchParams.append('filter', params.filter || '');
        url.searchParams.append('heatSort', params.sort ? 'true' : 'false');
        url.searchParams.append('type', String(params.type) || '0');
        url.searchParams.append('t', Date.now().toString());

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`API 请求失败，状态码: ${response.status}`);
        }

        const data = await response.json() as any[];
        return data.map(item => ({
            ...item
        }));

    } catch (error) {
        toast.error(`获取数据失败:${error}`, {
            timeout: 3000
        });
        console.error('获取数据失败:', error);
        return [];
    }
};