import {ref} from "vue";
import {appStore} from "./store.ts";
import {getBackgroundUrl} from "./uploadImage.ts";
import {toast} from "./others.ts";
import {getFontUrl} from "./fonts.ts";

export const opacity = ref(1)
export const backgroundOpacity = ref(1);
export const layoutMode = ref('cover');
export const backgroundStr = ref<string | null>(null)
export const backgroundUrl = ref<string | null>(null)
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
    }
    if (fontPath != 'null' && fontPath != '') {
        try {
            const fontName = 'CustomFont';
            let fontUrl = await getFontUrl(fontPath);
            const fontFace = new FontFace(fontName, `url('${fontUrl}')`);
            await fontFace.load();
            document.fonts.add(fontFace);
            document.body.style.fontFamily = 'CustomFont, sans-serif !important';
        } catch (e) {
            toast.error(`字体加载失败:${e}`, {timeout: 3000});
            console.error('字体加载失败', e);
        }
    }
}