import {ref} from "vue";
import {invoke} from "@tauri-apps/api/core";

export const userData = ref<Partial<UserData> | null>(null)

export interface UserData {
    id: number,
    nickname: string;
    avatar: string;
    qq: string;
    access_token: string;
    openid: string;
    schematics: number;
    classification:string;
    cloud: number;
}

export const fetchUserData = async () => {
    try {
        userData.value = await invoke<UserData>('get_user_data')

    } catch (err) {
        console.error('背景加载失败:', err);
        return null;
    }
}

export const fetchUserClassification = async () => {
    try {
        const classification = await invoke<string>('get_user_classification')
        // The schematic page can mount before the app-level user request has
        // completed (for example when opened directly from a deep link).
        // Keep that race from turning a successful classification lookup into
        // a null-reference error.
        if (!userData.value) {
            userData.value = {}
        }
        userData.value.classification = classification
        return classification
    } catch (err) {
        console.error('背景加载失败:', err);
        return null;
    }
}
