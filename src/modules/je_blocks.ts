import {invoke} from "@tauri-apps/api/core";
import {ref} from "vue";
import {toast} from "./others.ts";

export const jeBlocks = ref<SubData[]>()
let jeBlocksRequest: Promise<SubData[]> | null = null
export interface SubData {
    zh_cn: string;
    block_name: string;
    block_id: string;
    version_map: Record<number, string>;
}

export async function fetchJeBlocks(
): Promise<SubData[]> {
    if (jeBlocks.value) return jeBlocks.value

    if (jeBlocksRequest) return jeBlocksRequest

    jeBlocksRequest = (async () => {
    try {
        const data = await invoke<SubData[]>('get_je_blocks')
        jeBlocks.value = data
        return data
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`err: ${error}`);
    }
    })().finally(() => {
        jeBlocksRequest = null
    })

    return jeBlocksRequest
}
