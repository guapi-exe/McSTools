import {ref} from "vue";
import {appStore} from "./store.ts";
import {getBackgroundUrl} from "./uploadImage.ts";
import {toast} from "./others.ts";
import {getFontUrl} from "./fonts.ts";

export const opacity = ref(1)
export const backgroundOpacity = ref(1);
export const layoutMode = ref('cover');
export const backgroundUrl = ref<string | null>(null)

// Translate a personalization layout choice into real CSS. The previous raw
// passthrough produced invalid values ('repeat' is not a background-size).
export const resolveBackgroundLayout = (mode: string): { backgroundSize: string; backgroundRepeat: string } => {
    switch (mode) {
        case 'stretch':
            return {backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat'};
        case 'repeat':
            return {backgroundSize: 'auto', backgroundRepeat: 'repeat'};
        case 'contain':
            return {backgroundSize: 'contain', backgroundRepeat: 'no-repeat'};
        default:
            return {backgroundSize: 'cover', backgroundRepeat: 'no-repeat'};
    }
}

export const removeCustomFont = () => {
    document.fonts.forEach(font => {
        if (font.family === 'CustomFont') {
            document.fonts.delete(font);
        }
    });
}

export const initTheme = async () => {
    const fontPath = await appStore.get('fontPath', '')
    const bgPath = await appStore.get('backgroundImage', '')
    backgroundOpacity.value = await appStore.get('backgroundOpacity', 0.9);
    layoutMode.value = await appStore.get('layoutMode', 'cover');
    opacity.value = await appStore.get('opacity', 0.8);
    if (bgPath != 'null' && bgPath != '') {
        try {
            backgroundUrl.value = await getBackgroundUrl(bgPath)
        } catch (error) {
            toast.error(`发生了一个错误:${error}`, {
                timeout: 3000
            });
            console.error('背景加载失败:', error)
            backgroundUrl.value = null
        }
    } else {
        backgroundUrl.value = null
    }
    if (fontPath != 'null' && fontPath != '') {
        try {
            const fontName = 'CustomFont';
            let fontUrl = await getFontUrl(fontPath);
            if (fontUrl) {
                // Drop the previous face first so re-uploading a font replaces
                // it instead of registering a duplicate under the same family.
                removeCustomFont();
                const fontFace = new FontFace(fontName, `url('${fontUrl}')`);
                await fontFace.load();
                document.fonts.add(fontFace);
            }
        } catch (e) {
            toast.error(`字体加载失败:${e}`, {timeout: 3000});
            console.error('字体加载失败', e);
        }
    }
}
