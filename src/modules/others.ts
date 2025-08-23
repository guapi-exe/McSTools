import { useToast } from "vue-toastification";
import {open} from "@tauri-apps/plugin-shell";
import {ref} from "vue";
import {appStore} from "./store.ts";
import {initTheme} from "./theme.ts";
import {ThemeInstance} from "vuetify/framework";
export const toast = useToast();
export const selectLoading = ref();
export const selectClassification = ref<string>('');
export const getBlockIcon = (blockId: string) => {
    const block = blockId.split(':');
    return new URL(`../assets/icon/icon-exports-x32/${block[0]}__${block[1]}.png`, import.meta.url).href
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