import { useToast } from "vue-toastification";
import {open} from "@tauri-apps/plugin-shell";
import {ref} from "vue";
import {appStore} from "./store.ts";
import {initTheme} from "./theme.ts";
import {ThemeInstance} from "vuetify/framework";
import { blockIconSpriteMap } from "./threed_data/load_resource";
export const toast = useToast();
export const selectLoading = ref();
export const selectClassification = ref<string>('');

const iconDataUrlCache = new Map<string, string>();
const atlasImageCache = new Map<string, HTMLImageElement>();
const atlasLoadingPromises = new Map<string, Promise<HTMLImageElement>>();
const atlasCanvasCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

export const iconCacheVersion = ref(0);

/**
 * 获取或创建复用的 canvas
 */
function getOrCreateCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
    const cacheKey = `canvas_${size}`;
    if (atlasCanvasCache.has(cacheKey)) {
        return atlasCanvasCache.get(cacheKey)!;
    }
    
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(size, size);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
    }
    atlasCanvasCache.set(cacheKey, canvas);
    return canvas;
}

/**
 * 从精灵图裁剪图标并返回 Data URL（优化版）
 */
const extractIconFromAtlas = (atlasUrl: string, uv: [number, number, number, number]): string => {
    const cacheKey = `${atlasUrl}_${uv.join(',')}`;
    
    if (iconDataUrlCache.has(cacheKey)) {
        return iconDataUrlCache.get(cacheKey)!;
    }
    
    const atlasImage = atlasImageCache.get(atlasUrl);
    if (atlasImage) {
        try {
            const [u0, v0, u1, v1] = uv;
            const x = Math.floor(u0 * atlasImage.width);
            const y = Math.floor(v0 * atlasImage.height);
            const w = Math.ceil((u1 - u0) * atlasImage.width);
            const h = Math.ceil((v1 - v0) * atlasImage.height);
            
            const canvas = getOrCreateCanvas(Math.max(w, h, 32));
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
            ctx.clearRect(0, 0, w, h);
            
            ctx.drawImage(atlasImage, x, y, w, h, 0, 0, w, h);
            let dataUrl: string;
            if (canvas instanceof OffscreenCanvas) {
                canvas.convertToBlob({ type: 'image/png' }).then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        iconDataUrlCache.set(cacheKey, reader.result as string);
                        iconCacheVersion.value++;
                    };
                    reader.readAsDataURL(blob);
                });
                return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            } else {
                dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
                iconDataUrlCache.set(cacheKey, dataUrl);
                return dataUrl;
            }
        } catch (err) {
            console.error('Failed to extract icon:', err, { atlasUrl, uv });
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        }
    }
    
    if (!atlasLoadingPromises.has(atlasUrl)) {
        const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = async () => {
                console.log(`Atlas loaded: ${atlasUrl.substring(0, 50)}...`, { width: img.width, height: img.height });
                atlasImageCache.set(atlasUrl, img);
                
                const sprites = Object.entries(blockIconSpriteMap).filter(([, sprite]) => sprite.atlasUrl === atlasUrl);
                const BATCH_SIZE = 10; 
                let processedCount = 0;
                
                const processBatch = async () => {
                    for (let i = 0; i < sprites.length; i += BATCH_SIZE) {
                        const batch = sprites.slice(i, i + BATCH_SIZE);
                        
                        for (const [, sprite] of batch) {
                            const key = `${atlasUrl}_${sprite.uv.join(',')}`;
                            if (!iconDataUrlCache.has(key)) {
                                try {
                                    const [u0, v0, u1, v1] = sprite.uv;
                                    const x = Math.floor(u0 * img.width);
                                    const y = Math.floor(v0 * img.height);
                                    const w = Math.ceil((u1 - u0) * img.width);
                                    const h = Math.ceil((v1 - v0) * img.height);
                                    
                                    const canvas = getOrCreateCanvas(Math.max(w, h, 32));
                                    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
                                    ctx.clearRect(0, 0, w, h);
                                    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                                    
                                    if (canvas instanceof HTMLCanvasElement) {
                                        iconDataUrlCache.set(key, canvas.toDataURL('image/png'));
                                        processedCount++;
                                    }
                                } catch (err) {
                                    console.error('Failed to process icon:', err);
                                }
                            }
                        }
                        
                        iconCacheVersion.value++;
                        await new Promise(resolve => setTimeout(resolve, 16)); 
                    }
                    
                    console.log(`Processed ${processedCount} icons from atlas`);
                };
                
                processBatch();
                resolve(img);
            };
            
            img.onerror = (err) => {
                console.error('Failed to load atlas image:', atlasUrl, err);
                reject(err);
            };
            
            img.src = atlasUrl;
        });
        
        atlasLoadingPromises.set(atlasUrl, loadPromise);
        
        loadPromise.then(() => {
            atlasLoadingPromises.delete(atlasUrl);
        }).catch((err) => {
            console.error('Atlas loading failed:', err);
            atlasLoadingPromises.delete(atlasUrl);
        });
    }
    
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

export const getBlockIcon = (blockId: string): string => {
    const sprite = blockIconSpriteMap[blockId];

    if (!sprite) {
        try {
            const block = blockId.split(':');
            return new URL(`../assets/icon/icon-exports-x32/${block[0]}__${block[1]}.png`, import.meta.url).href;
        } catch {
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        }
    }

    const cacheKey = `${sprite.atlasUrl}_${sprite.uv.join(',')}`;
    if (iconDataUrlCache.has(cacheKey)) {
        return iconDataUrlCache.get(cacheKey)!;
    }
    
    const result = extractIconFromAtlas(sprite.atlasUrl, sprite.uv);
    
    if (result.startsWith('data:image/png;base64,iVBORw0KGgo')) {
        try {
            const block = blockId.split(':');
            return new URL(`../assets/icon/icon-exports-x32/${block[0]}__${block[1]}.png`, import.meta.url).href;
        } catch {
            return result;
        }
    }
    
    return result;
};

export const getIconUrl = (blockId: string) => {
    iconCacheVersion.value;
    return getBlockIcon(blockId);
};

export const getBlockImg = (blockId: string) => {
    return new URL(`../assets/blocks_img/${blockId}.png`, import.meta.url).href
};
export const openLink = async (url: string) => {
    try {
        await open(url)
    } catch (err) {
        console.error('打开链接失败:', err)
    }
}
let darkModeMatcher = null;
export const detectTheme = async(theme: ThemeInstance) => {
    let autoTheme = await appStore.get('autoTheme', false)
    console.log(autoTheme)
    if (window.matchMedia && autoTheme) {
        darkModeMatcher = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeMatcher.addEventListener('change', async (e) => {
            let autoTheme = await appStore.get('autoTheme', false)
            if (!autoTheme) return;
            if (e.matches) {
                await appStore.set('selectedTheme', 'grey_dark')
                theme.global.name.value = 'grey_dark'
                await appStore.set('opacity', 0.5)
                await initTheme();
            }else {
                let newTheme = await appStore.get('oldTheme', 'blue')
                await appStore.set('selectedTheme', newTheme)
                theme.global.name.value = newTheme
                await initTheme();
            }
        });
    }
}

export const clearThemeListeners = () => {
    if (darkModeMatcher) {
        darkModeMatcher.matcher.removeEventListener('change', darkModeMatcher.callback);
        darkModeMatcher = null;
    }
}