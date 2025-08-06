import {BaseDirectory, mkdir, readFile, writeFile, exists} from '@tauri-apps/plugin-fs';
import {path} from "@tauri-apps/api";
import {toast} from "./others.ts";


const saveImage = async (file: File | undefined) => {
    if (!file) return;

    await mkdir("background", {
        baseDir: BaseDirectory.AppData,
        recursive: true
    });

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `background.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const blob = new Blob([uint8Array], { type: file.type });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
            URL.revokeObjectURL(url);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('图片加载失败'));
        };

        img.src = url;
    });

    await writeFile(
        `background/${filename}`,
        uint8Array,
        { baseDir: BaseDirectory.AppData }
    );

    const fullPath = await getFullPath(filename);



    return {
        success: true,
        path: fullPath,
        name: filename,
        size: uint8Array.length / 1024,
        dimensions: dimensions
    };
};

const getFullPath = async (filename: string) => {
    return await path.join(
        'background',
        filename
    );
};

const getMimeType = (path: string): string => {
    const ext = path?.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
}

const getBackgroundUrl = async (path: string) => {
    try {
        const fileExists = await exists(path, {
            baseDir: BaseDirectory.AppData
        });

        if (!fileExists) return null;

        const buffer = await readFile(path, {
            baseDir: BaseDirectory.AppData
        });
        const blob = new Blob([buffer], {
            type: getMimeType(path)
        });
        return URL.createObjectURL(blob);

    } catch (error) {
        console.error('背景加载失败:', error);
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        return null;
    }
};

const arrayBufferToBase64 = (buffer: Uint8Array) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
};
const getBackgroundBase64Url = async (path: string) => {
    try {
        const fileExists = await exists(path, {
            baseDir: BaseDirectory.AppData
        });

        if (!fileExists) return null;

        const buffer = await readFile(path, {
            baseDir: BaseDirectory.AppData
        });

        const base64String = arrayBufferToBase64(buffer);

        return `data:${getMimeType(path)};base64,${base64String}`;

    } catch (error) {
        console.error('背景加载失败:', error);
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        return null;
    }
};

export { saveImage, getBackgroundUrl, getBackgroundBase64Url };