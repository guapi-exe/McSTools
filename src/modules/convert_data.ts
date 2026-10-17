import {invoke} from "@tauri-apps/api/core";
import {toast} from "./others.ts";
type SchematicType = "Create" | "Litematic" | "Bg" | "We" | "Be" | "McEdit";

interface Target {
    has: boolean;
    size: string;
    version: number;
}

export interface ConvertData {
    schematic_type: SchematicType;
    schematic_type_id: number;
    sub_type: number;
    version: number;
    size: string;
    schematics: Record<SchematicType, Record<number, Target>>;
}

export const fetchConvertData = async (id: number):Promise<ConvertData> => {
    try {
        return await invoke('get_schematic_convert_data', {
            id: id,
        })
    } catch (err) {
        toast.error(`发生了一个错误:${err}`, {
            timeout: 3000
        });
        throw new Error(` ${err}`);
    }
}