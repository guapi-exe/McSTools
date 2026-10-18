import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';
import {buildLibraryRequest, normalizeLibraryPage} from './mcs_api_contract';
import type {McsCategory, McsCollection, McsFilters, McsVersion, McsVersionDetail} from './mcs_api_contract';

export const mcsConnected = ref(false);
export const mcsSessionRevision = ref(0);

export async function connectMcsApi(key: string) {
    await invoke('set_mcs_api_key', {key});
    mcsConnected.value = !!key.trim();
    mcsSessionRevision.value += 1;
}

export function mcsErrorMessage(error: unknown): string {
    const problem = error as {message?: unknown; retryAfterSeconds?: number};
    const message = typeof problem?.message === 'string' ? problem.message : typeof error === 'string' ? error : '请求失败，请稍后重试';
    return problem?.retryAfterSeconds ? `${message}（约 ${problem.retryAfterSeconds} 秒后）` : message;
}

export async function fetchMcSchematics(collection: McsCollection, filters: McsFilters, cursor?: string, page = 1) {
    const data = await invoke('mcs_api_get', buildLibraryRequest(collection, filters, cursor, page));
    return normalizeLibraryPage(data, collection);
}

export async function fetchMcsCategories(): Promise<McsCategory[]> {
    const data = await invoke<{items: McsCategory[]}>('mcs_api_get', {path: '/api/v1/categories', query: {}, authenticated: false});
    if (!Array.isArray(data?.items)) throw new Error('分类响应格式不正确');
    return data.items;
}

export function fetchMcsVersions(id: string, authenticated: boolean, cursor?: string) {
    const query: Record<string, string> = {limit: '100'};
    if (cursor) query.cursor = cursor;
    return invoke<{items: McsVersion[]; nextCursor?: string}>('mcs_api_get', {
        path: `/api/v1/blueprints/${id}/versions`, query, authenticated,
    });
}

export function fetchMcsVersion(id: string, version: number, authenticated: boolean) {
    return invoke<McsVersionDetail>('mcs_api_get', {
        path: `/api/v1/blueprints/${id}/versions/${version}`, query: {}, authenticated,
    });
}

export function importMcsVersion(id: string, version: number, authenticated: boolean) {
    return invoke<{filename: string; bytes: number}>('import_mcs_blueprint', {blueprintId: id, version, authenticated});
}
