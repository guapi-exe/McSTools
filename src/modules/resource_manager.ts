import { fetch } from '@tauri-apps/plugin-http';
import { mkdir, readDir, readTextFile, writeFile, readFile, remove } from '@tauri-apps/plugin-fs';
import { join, resolveResource } from '@tauri-apps/api/path';
import { ref } from 'vue';
import { toast } from './others.ts';

const GITHUB_RAW_BASE = 'https://ghcr.mcschematic.top/https://raw.githubusercontent.com/guapi-exe/mcstools_resources/master';
const RESOURCES_JSON_URL = `${GITHUB_RAW_BASE}/resources.json`;

/**
 * 远程资源配置接口
 */
export interface RemoteResourceConfig {
    namespace: string;
    name?: string;
    version?: string;
    description?: string;
    authors?: string[];
    license?: string[];
    homepage?: string;
    blockCount: number;
    itemCount: number;
}

/**
 * 本地资源配置接口 (与 config.json 结构一致)
 */
export interface LocalResourceConfig {
    namespace: string;
    name?: string;
    version?: string;
    description?: string;
    authors?: string[];
    license?: string[];
    homepage?: string;
    blockCount: number;
    itemCount: number;
}

export type ResourceStatus = 'installed' | 'not-installed' | 'update-available' | 'downloading';

export interface ResourceItem {
    key: string;  // 资源的 key (如 "minecraft", "create")
    remote?: RemoteResourceConfig;
    local?: LocalResourceConfig;
    status: ResourceStatus;
    downloadProgress?: number;
}

export const resourceList = ref<ResourceItem[]>([]);
export const isLoadingResources = ref(false);
export const downloadingResources = ref<Set<string>>(new Set());

export async function fetchRemoteResources(): Promise<Record<string, RemoteResourceConfig>> {
    try {
        const response = await fetch(RESOURCES_JSON_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as Record<string, RemoteResourceConfig>;
        return data;
    } catch (error) {
        console.error('Failed to fetch remote resources:', error);
        throw error;
    }
}

export async function getLocalResources(): Promise<Record<string, LocalResourceConfig>> {
    const localResources: Record<string, LocalResourceConfig> = {};
    
    try {
        const resourcePath = await resolveResource('data/resource/');
        const resourceDirs = await readDir(resourcePath);
        
        for (const dir of resourceDirs) {
            if (!dir.isDirectory) continue;
            
            try {
                const modPath = await resolveResource(`data/resource/${dir.name}`);
                const configPath = await join(modPath, 'config.json');
                const configText = await readTextFile(configPath);
                const config: LocalResourceConfig = JSON.parse(configText);
                localResources[dir.name] = config;
            } catch (err) {
                console.warn(`Failed to read config for ${dir.name}:`, err);
            }
        }
    } catch (err) {
        console.error('Failed to read local resources:', err);
    }
    
    return localResources;
}


export async function loadResourceList(): Promise<void> {
    isLoadingResources.value = true;
    
    try {
        const [remoteResources, localResources] = await Promise.all([
            fetchRemoteResources().catch(err => {
                console.error('Failed to fetch remote resources:', err);
                toast.error('获取远程资源列表失败，请检查网络连接');
                return {} as Record<string, RemoteResourceConfig>;
            }),
            getLocalResources()
        ]);
        
        const allKeys = new Set([
            ...Object.keys(remoteResources),
            ...Object.keys(localResources)
        ]);
        
        const items: ResourceItem[] = [];
        
        for (const key of allKeys) {
            const remote = remoteResources[key];
            const local = localResources[key];
            
            let status: ResourceStatus = 'not-installed';
            
            if (local && remote) {
                if (local.version && remote.version && local.version !== remote.version) {
                    status = 'update-available';
                } else {
                    status = 'installed';
                }
            } else if (local) {
                status = 'installed';
            } else {
                status = 'not-installed';
            }
            
            if (downloadingResources.value.has(key)) {
                status = 'downloading';
            }
            
            items.push({
                key,
                remote,
                local,
                status
            });
        }
        
        items.sort((a, b) => {
            const nameA = a.remote?.name || a.local?.name || a.key;
            const nameB = b.remote?.name || b.local?.name || b.key;
            return nameA.localeCompare(nameB);
        });
        
        resourceList.value = items;
        
    } finally {
        isLoadingResources.value = false;
    }
}


const RESOURCE_FILES = [
    'config.json',
    'icon.png',
    'assets/block_definition/data.min.json',
    'assets/model/data.min.json',
    'assets/atlas/data.min.json',
    'assets/atlas/atlas.png',
    'assets/opaque/blocks.json',
    'icons/data.min.json',
    'icons/atlas.png'
];

async function downloadFile(url: string): Promise<Uint8Array> {
    const response = await fetch(url, {
        method: 'GET',
    });
    
    if (!response.ok) {
        throw new Error(`Failed to download: ${url}, status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

export async function downloadResource(resourceKey: string): Promise<boolean> {
    if (downloadingResources.value.has(resourceKey)) {
        toast.warning('该资源正在下载中...');
        return false;
    }
    
    downloadingResources.value.add(resourceKey);
    
    // 更新状态为下载中
    const updateProgress = (progress: number) => {
        const item = resourceList.value.find(r => r.key === resourceKey);
        if (item) {
            item.status = 'downloading';
            item.downloadProgress = progress;
        }
    };
    
    updateProgress(0);
    
    try {
        const resourcePath = await resolveResource('data/resource/');
        const modPath = await join(resourcePath, resourceKey);
        
        const dirs = [
            modPath,
            await join(modPath, 'assets'),
            await join(modPath, 'assets/block_definition'),
            await join(modPath, 'assets/model'),
            await join(modPath, 'assets/atlas'),
            await join(modPath, 'assets/opaque'),
            await join(modPath, 'icons')
        ];
        
        for (const dir of dirs) {
            try {
                await mkdir(dir, { recursive: true });
            } catch (e) {
            }
        }
        
        const totalFiles = RESOURCE_FILES.length;
        let downloadedFiles = 0;
        
        for (const filePath of RESOURCE_FILES) {
            const url = `${GITHUB_RAW_BASE}/${resourceKey}/${filePath}`;
            const localPath = await join(modPath, filePath);
            
            try {
                console.log(`Downloading: ${url}`);
                const data = await downloadFile(url);
                await writeFile(localPath, data);
                
                downloadedFiles++;
                updateProgress(Math.round((downloadedFiles / totalFiles) * 100));
            } catch (err) {
                console.warn(`Failed to download ${filePath}:`, err);
                downloadedFiles++;
                updateProgress(Math.round((downloadedFiles / totalFiles) * 100));
            }
        }
        
        toast.success(`资源 ${resourceKey} 下载完成！`);
        
        downloadingResources.value.delete(resourceKey);
        await loadResourceList();

        return true;
        
    } catch (error) {
        console.error(`Failed to download resource ${resourceKey}:`, error);
        toast.error(`下载资源 ${resourceKey} 失败: ${error}`);
        
        const item = resourceList.value.find(r => r.key === resourceKey);
        if (item) {
            item.status = item.local ? 'installed' : 'not-installed';
            item.downloadProgress = undefined;
        }
        downloadingResources.value.delete(resourceKey);
        
        return false;
    }
}

export async function downloadMultipleResources(resourceKeys: string[]): Promise<void> {
    for (const key of resourceKeys) {
        await downloadResource(key);
    }
}

export function getResourceDisplayName(item: ResourceItem): string {
    return item.remote?.name || item.local?.name || item.key;
}

export function getResourceDescription(item: ResourceItem): string {
    return item.remote?.description || item.local?.description || '';
}

export function getResourceVersion(item: ResourceItem): string | undefined {
    return item.remote?.version || item.local?.version;
}

export function getResourceAuthors(item: ResourceItem): string[] {
    return item.remote?.authors || item.local?.authors || [];
}

export function getResourceBlockCount(item: ResourceItem): number {
    return item.remote?.blockCount || item.local?.blockCount || 0;
}

export function getResourceItemCount(item: ResourceItem): number {
    return item.remote?.itemCount || item.local?.itemCount || 0;
}

const iconUrlCache = new Map<string, string>();


export async function getResourceIconUrl(resourceKey: string): Promise<string | null> {
    if (iconUrlCache.has(resourceKey)) {
        return iconUrlCache.get(resourceKey)!;
    }
    
    try {
        const modPath = await resolveResource(`data/resource/${resourceKey}`);
        const iconPath = await join(modPath, 'icon.png');
        const iconData = await readFile(iconPath);
        const blob = new Blob([new Uint8Array(iconData)], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        iconUrlCache.set(resourceKey, url);
        return url;
    } catch (err) {
        console.warn(`Failed to load icon for ${resourceKey}:`, err);
        return null;
    }
}

export function getRemoteIconUrl(resourceKey: string): string {
    return `${GITHUB_RAW_BASE}/${resourceKey}/icon.png`;
}

export async function deleteResource(resourceKey: string): Promise<boolean> {
    try {
        const modPath = await resolveResource(`data/resource/${resourceKey}`);
        
        await remove(modPath, { recursive: true });
        
        if (iconUrlCache.has(resourceKey)) {
            const url = iconUrlCache.get(resourceKey)!;
            URL.revokeObjectURL(url);
            iconUrlCache.delete(resourceKey);
        }
        
        toast.success(`资源 ${resourceKey} 已卸载`);
        
        await loadResourceList();
        
        return true;
    } catch (error) {
        console.error(`Failed to delete resource ${resourceKey}:`, error);
        toast.error(`卸载资源 ${resourceKey} 失败: ${error}`);
        return false;
    }
}
