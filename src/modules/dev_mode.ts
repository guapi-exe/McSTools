import {invoke} from "@tauri-apps/api/core";
import {appStore} from "./store.ts";
import {toast} from "./others.ts";


export async function isDevModeEnabled() {
    return appStore.get('devMode', false)
}

export async function openDev(
) {
    if (!(await isDevModeEnabled())) {
        toast.info('请先在设置中启用调试模式。', {
            timeout: 2500
        });
        return false
    }

    try {
        await invoke('open_dev')
        return true
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        return false
    }
}