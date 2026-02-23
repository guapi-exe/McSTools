import {ref} from "vue";

export const image_data = ref<ProcessedImage>()

export const releaseProcessedImage = (data?: ProcessedImage) => {
    if (data?.objectUrl) {
        URL.revokeObjectURL(data.objectUrl)
    }
}

export const encode_image = async (file: File | undefined): Promise<ProcessedImage> => {
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const name = file.name.split('.').slice(0, -1).join('.');
    const objectUrl = URL.createObjectURL(file);

    const { width, height } = await new Promise<{
        width: number;
        height: number;
    }>((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight,
            });
        };

        img.onerror = () => {
            reject(new Error('图片加载失败'));
        };

        img.src = objectUrl;
    });

    return {
        name,
        ext,
        width,
        height,
        file,
        objectUrl,
    };
};

export interface ProcessedImage {
    name: string;
    ext: string;
    width: number;
    height: number;
    file: File;
    objectUrl: string;
}