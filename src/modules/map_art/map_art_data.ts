import {invoke} from "@tauri-apps/api/core";
import {toast} from "../others.ts";
import {shallowRef} from "vue";

export interface BlockColorData {
    left_top: number[];
    right_bottom: number[];
    right_top: number[];
    left_bottom: number[];
    average_rgb: number[];
    low_rgb: number[];
    normal_rgb: number[];
    high_rgb: number[];
    average_rgb_hex: string;
    low_rgb_hex: string;
    normal_rgb_hex: string;
    high_rgb_hex: string;
    zh_cn: string;
}

export interface SubData {
    left_top: number[];
    right_bottom: number[];
    right_top: number[];
    left_bottom: number[];
    average_rgb: number[];
    low_rgb: number[];
    normal_rgb: number[];
    high_rgb: number[];
    average_rgb_hex: string;
    low_rgb_hex: string;
    normal_rgb_hex: string;
    high_rgb_hex: string;
    zh_cn: string;
    id: string;
}

const categoryData = {
    "carpet": "地毯",
    "wool": "羊毛",
    "clay": "陶瓦与黏土",
    "concrete": "混凝土",
    "stone": "石材",
    "crafted": "工艺制品",
    "desert": "沙漠建材",
    "wood": "木材",
    "ore": "矿石",
    "the_end": "末地建材",
    "natural": "主世界",
    "nether": "下界建材",
    "ocean": "海洋建材"
}
export interface RawData {
    name: string;
    zh_cn: string;
    items: SubData[];
}

// The map-art table is read-only after loading.  A shallow ref avoids making
// every nested block/color field a Vue proxy (there are hundreds of them),
// which otherwise causes a noticeable pause when the toolbox is opened.
export const mapArtData = shallowRef<RawData[]>()

let mapArtsRequest: Promise<RawData[]> | null = null

export type CategoryBlocks = Record<string, Record<string, BlockColorData>>;

export async function fetchMapArtsData(
): Promise<RawData[]> {
    try {
        let data = await invoke<CategoryBlocks>('get_map_arts')
        return Object.entries(data).map(([category, blocks]) => ({
            name: category,
            zh_cn: categoryData[category],
            items: Object.entries(blocks).map(([id, data]) => ({
                id,
                ...data
            }))
        }))
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`err: ${error}`);
    }
}

/** Load the table once, on demand, and share concurrent requests. */
export function ensureMapArtData(): Promise<RawData[]> {
    if (mapArtData.value && mapArtData.value.length > 0) {
        return Promise.resolve(mapArtData.value)
    }

    if (!mapArtsRequest) {
        mapArtsRequest = fetchMapArtsData()
            .then((data) => {
                mapArtData.value = data
                return data
            })
            .finally(() => {
                mapArtsRequest = null
            })
    }

    return mapArtsRequest
}
