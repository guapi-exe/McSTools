import {invoke} from '@tauri-apps/api/core';
import {computed, ref} from 'vue';
import {buildLibraryRequest, normalizeLibraryPage} from './mcs_api_contract';
import type {McsCategory, McsCollection, McsFilters, McsVersion, McsVersionDetail} from './mcs_api_contract';

export const mcsConnected = ref(false);
export const mcsSessionRevision = ref(0);
export const mcsSaved = ref(false);
export const mcsStatus = ref<'disconnected' | 'restoring' | 'checking' | 'connected' | 'offline' | 'invalid' | 'limited'>('restoring');
export const mcsConnectionDialog = ref(false);
export const mcsConnectionBusy = ref(false);
export const mcsConnectionError = ref('');
export const mcsBlueprintCount = ref<number>();
export const mcsStatusLabel = computed(() => ({disconnected: '未连接蓝图站', restoring: '恢复站点连接…', checking: '正在连接蓝图站…', connected: '蓝图站已连接', offline: '站点暂不可用', invalid: '连接已失效 · 请重新连接', limited: '站点权限不足'}[mcsStatus.value]));
interface Connection { connected: boolean; persisted: boolean; blueprintCount?: number }
let sessionEpoch = 0;
let restoreRequest: Promise<void> | undefined;
let refreshRequest: Promise<void> | undefined;

function applyConnection(connection: Connection) {
    mcsConnected.value = connection.connected;
    mcsSaved.value = connection.persisted;
    mcsBlueprintCount.value = connection.blueprintCount ?? undefined;
    mcsConnectionError.value = '';
    mcsStatus.value = connection.connected ? 'connected' : 'disconnected';
    mcsSessionRevision.value++;
}

export function restoreMcsConnection(): Promise<void> {
    return restoreRequest ??= (async () => {
        const epoch = sessionEpoch;
        try {
            const connection = await invoke<Connection>('restore_mcs_connection');
            if (epoch !== sessionEpoch) return;
            applyConnection(connection);
            if (connection.connected) await refreshMcsConnection();
        } catch (cause) {
            if (epoch !== sessionEpoch) return;
            mcsStatus.value = 'disconnected';
            mcsConnectionError.value = mcsErrorMessage(cause);
            // A temporarily unavailable database can be retried.
            restoreRequest = undefined;
        }
    })();
}

export function refreshMcsConnection(): Promise<void> {
    if (!mcsSaved.value) return restoreMcsConnection();
    return refreshRequest ??= (async () => {
        const epoch = sessionEpoch;
        mcsStatus.value = 'checking';
        try {
            const data = await invoke<{items: unknown[]; totalCount?: number}>('mcs_api_get', {path: '/api/v1/account/blueprints', query: {page: '1', limit: '1'}, authenticated: true});
            if (epoch !== sessionEpoch) return;
            if (!Array.isArray(data?.items)) throw new Error('站点账户响应格式不正确');
            mcsBlueprintCount.value = typeof data.totalCount === 'number' ? data.totalCount : undefined;
            if (!mcsConnected.value) mcsSessionRevision.value++;
            mcsConnected.value = true; mcsStatus.value = 'connected'; mcsConnectionError.value = '';
        } catch (cause) {
            if (epoch === sessionEpoch) {
                const code = (cause as {code?: string})?.code;
                mcsStatus.value = code === 'AUTH_REQUIRED' ? 'invalid' : code === 'FORBIDDEN' ? 'limited' : 'offline';
                if (code === 'AUTH_REQUIRED') { mcsConnected.value = false; mcsBlueprintCount.value = undefined; mcsSessionRevision.value++; }
                mcsConnectionError.value = mcsErrorMessage(cause);
            }
        } finally { if (epoch === sessionEpoch) refreshRequest = undefined; }
    })();
}

export async function connectMcsApi(key: string) {
    if (mcsConnectionBusy.value) return;
    mcsConnectionBusy.value = true;
    ++sessionEpoch; refreshRequest = undefined;
    try {
        const connection = await invoke<Connection>('set_mcs_api_key', {key});
        applyConnection(connection);
    } catch (cause) {
        if (mcsStatus.value === 'checking' || mcsStatus.value === 'restoring') mcsStatus.value = mcsSaved.value ? 'offline' : 'disconnected';
        throw cause;
    } finally { mcsConnectionBusy.value = false; }
}

export function mcsErrorMessage(error: unknown): string {
    const problem = error as {message?: unknown; retryAfterSeconds?: number};
    const message = typeof problem?.message === 'string' ? problem.message : typeof error === 'string' ? error : '请求失败，请稍后重试';
    return problem?.retryAfterSeconds ? `${message}（约 ${problem.retryAfterSeconds} 秒后）` : message;
}

async function sessionInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const epoch = sessionEpoch;
    try { return await invoke<T>(command, args); }
    catch (cause) {
        if (args.authenticated && epoch === sessionEpoch && (cause as {code?: string})?.code === 'AUTH_REQUIRED') {
            mcsConnected.value = false; mcsStatus.value = 'invalid'; mcsBlueprintCount.value = undefined;
            mcsConnectionError.value = mcsErrorMessage(cause); mcsSessionRevision.value++;
        }
        throw cause;
    }
}

export async function fetchMcSchematics(collection: McsCollection, filters: McsFilters, cursor?: string, page = 1) {
    const data = await sessionInvoke('mcs_api_get', buildLibraryRequest(collection, filters, cursor, page));
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
    return sessionInvoke<{items: McsVersion[]; nextCursor?: string}>('mcs_api_get', {
        path: `/api/v1/blueprints/${id}/versions`, query, authenticated,
    });
}

export function fetchMcsVersion(id: string, version: number, authenticated: boolean) {
    return sessionInvoke<McsVersionDetail>('mcs_api_get', {
        path: `/api/v1/blueprints/${id}/versions/${version}`, query: {}, authenticated,
    });
}

export function importMcsVersion(id: string, version: number, authenticated: boolean) {
    return sessionInvoke<{filename: string; bytes: number}>('import_mcs_blueprint', {blueprintId: id, version, authenticated});
}
