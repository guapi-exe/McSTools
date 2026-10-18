// HTTP names from /api/v1/openapi.json?audience=developer, not the old numeric enum.
export const MCS_ORIGIN = 'https://www.mcschematic.top';
export const sourceFormats = [
    {value: 'create', title: '机械动力 / Java 结构', extension: 'nbt'},
    {value: 'litematica', title: '投影（Litematica）', extension: 'litematic'},
    {value: 'building_gadgets', title: '建筑小帮手', extension: 'json'},
    {value: 'world_edit', title: '创世神（Sponge）', extension: 'schem'},
    {value: 'bedrock_edition', title: '基岩版结构', extension: 'mcstructure'},
    {value: 'mcedit', title: '传统创世神 / MCEdit', extension: 'schematic'},
] as const;
export type SourceFormat = typeof sourceFormats[number]['value'];
export type McsCollection = 'public' | 'mine' | 'favourites';
export type McsSort = 'latest' | 'oldest' | 'popular' | 'least_popular';
export interface McsCategory { id: string; slug: string; name: string; parentId?: string; }
export interface McsLibraryItem {
    id: string; slug: string; title: string; description: string; author: string;
    avatarUrl?: string; previewUrl?: string; sourceFormat?: SourceFormat;
    version: number; updatedAt: string; category?: string; gameVersion?: string;
    downloads?: number; featured: boolean; available: boolean; visibility?: string;
}
export interface McsListPage { items: McsLibraryItem[]; nextCursor?: string; totalCount?: number; totalPages?: number; }
export interface McsFilters { keyword: string; sort: McsSort; featured: boolean; category: string; format: string; gameVersion: string; }
export interface McsVersion { number: number; sourceFormat: SourceFormat; createdAt: string; changelog?: string; }
export interface McsVersionDetail extends McsVersion {
    originalFilename: string; originalSourceByteSize: number;
    trustedAnalysis?: {dimensions: {x: number; y: number; z: number}; visibleBlockCount: number; paletteSize: number};
}

export function safeMcsImageUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    try {
        const url = new URL(value, MCS_ORIGIN);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
}

export function blueprintWebUrl(item: Pick<McsLibraryItem, 'id' | 'slug'>): string {
    return `${MCS_ORIGIN}/blueprints/${encodeURIComponent(item.id)}/${encodeURIComponent(item.slug)}`;
}

export function formatLabel(format?: string): string {
    return sourceFormats.find(item => item.value === format)?.title ?? '未知格式';
}

export function buildLibraryRequest(collection: McsCollection, filters: McsFilters, cursor?: string, page = 1) {
    const query: Record<string, string> = {limit: '24'};
    if (collection === 'favourites') {
        if (cursor) query.cursor = cursor;
        return {path: '/api/v1/account/favourites', query, authenticated: true};
    }
    const keyword = (filters.keyword ?? '').trim().slice(0, 120);
    if (keyword) query.q = keyword;
    if (filters.category) query.category = filters.category;
    if (filters.format) query.format = filters.format;
    if (filters.gameVersion) query.gameVersion = filters.gameVersion;
    if (collection === 'mine') {
        query.page = String(Math.max(1, Math.min(10000, Math.floor(page))));
        query.filter = 'active';
        query.sort = 'updated';
        return {path: '/api/v1/account/blueprints', query, authenticated: true};
    }
    query.extra = 'none'; // Keep authenticated private works out of discovery.
    query.sort = filters.sort;
    if (filters.featured) query.featured = 'true';
    if (cursor) query.cursor = cursor;
    return {path: '/api/v1/blueprints', query, authenticated: false};
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const formatValue = (value: unknown) => sourceFormats.find(item => item.value === value)?.value;
const optionalCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;

export function normalizeLibraryPage(data: any, collection: McsCollection): McsListPage {
    if (!data || !Array.isArray(data.items)) throw new Error('蓝图站列表响应格式不正确');
    const items = data.items.map((item: any): McsLibraryItem => {
        const favourite = collection === 'favourites';
        const id = favourite ? item?.blueprintId : item?.id;
        if (typeof id !== 'string' || !uuid.test(id)) throw new Error('蓝图站返回了无效蓝图 ID');
        const version = favourite ? item.versionNumber : item.currentVersion?.number;
        const sourceFormat = formatValue(favourite ? item.sourceFormat : item.currentVersion?.sourceFormat);
        const readable = typeof item.title === 'string' && typeof item.slug === 'string';
        const validVersion = Number.isSafeInteger(version) && version > 0;
        return {
            id, slug: stringValue(item.slug), title: stringValue(item.title, '此收藏当前不可访问'),
            description: stringValue(item.description), author: stringValue(item.author?.displayName, collection === 'mine' ? '我的蓝图' : ''),
            avatarUrl: safeMcsImageUrl(item.author?.avatarUrl), previewUrl: safeMcsImageUrl(item.previewUrl),
            sourceFormat, version: validVersion ? version : 0,
            updatedAt: stringValue(favourite ? item.blueprintUpdatedAt ?? item.favouritedAt : item.updatedAt),
            category: stringValue(item.category?.name ?? item.categoryName),
            gameVersion: stringValue(item.sourceGameVersion?.release ?? item.sourceGameVersion?.family),
            downloads: optionalCount(item.engagement?.downloadCount), featured: item.featured === true,
            available: readable && validVersion && !!sourceFormat && !item.deletedAt && !item.archivedAt && item.accessState !== 'restricted',
            visibility: stringValue(item.visibility),
        };
    });
    return {items, nextCursor: typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : undefined,
        totalCount: optionalCount(data.totalCount), totalPages: optionalCount(data.totalPages)};
}

export function mergeLibraryItems(current: McsLibraryItem[], incoming: McsLibraryItem[]): McsLibraryItem[] {
    const byId = new Map(current.map(item => [item.id, item]));
    for (const item of incoming) byId.set(item.id, item);
    return [...byId.values()];
}
