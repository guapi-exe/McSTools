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
        userData.value.classification = await invoke<string>('get_user_classification')
    } catch (err) {
        console.error('背景加载失败:', err);
        return null;
    }
}