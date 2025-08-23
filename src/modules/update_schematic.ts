import {invoke} from "@tauri-apps/api/core";
import {toast} from "./others.ts";

export const update_schematic_name = async (
    id: number,
    name: string,
    schematic_tags: string,
    description: string
): Promise<boolean> => {
    try {
        return await invoke<boolean>(
            'update_schematic_name_description',
            {
                schematicId: id,
                name: name,
                schematicTags: schematic_tags,
                description: description,
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`发生了一个错误: ${error}`);
    }
}

export const update_user_classification = async (
    classification: string,
): Promise<boolean> => {
    try {
        return await invoke<boolean>(
            'update_user_classification_tauri',
            {
                classification: classification,
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`发生了一个错误: ${error}`);
    }
}

export const update_schematic_classification = async (
    id: number,
    classification: string,
): Promise<boolean> => {
    try {
        return await invoke<boolean>(
            'update_schematic_classification_tauri',
            {
                schematicId: id,
                classification: classification,
            }
        )
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`发生了一个错误: ${error}`);
    }
}