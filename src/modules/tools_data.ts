import {fetchSchematic, SchematicsData} from "./schematics_data.ts";
import {fetchRequirementsWithStats, RequirementStatistics} from "./requirements.ts";
import {ref} from "vue";
import {invoke} from "@tauri-apps/api/core";
import {ConvertData, fetchConvertData} from "./convert_data.ts";
import {BlockData, fetchUniqueBlocks} from "./replace_data.ts";
import {toast} from "./others.ts";
import {fetchHistoryRecord, HistoryRecordData} from "./history_data.ts";

export let schematic_id = ref<number | undefined>();
export let schematicData = ref<SchematicsData | undefined>();
export let convertData = ref<ConvertData | undefined>();
export let schematicRequirements = ref<RequirementStatistics | undefined>();
export let schematicStr = ref<string | undefined>();
export let uniqueBlocks = ref<BlockData[] | undefined>();
export let historyRecordData = ref<HistoryRecordData | undefined>();
// Keep the tools window on a concrete panel from its first render. An
// undefined tab value makes Vuetify briefly mount an empty window while the
// route is entering, which is visible on slower machines.
export const activeTools = ref('schematic')
export const clear_tools = () =>{
    schematic_id.value = undefined
    schematicData.value = undefined
    schematicRequirements.value = undefined
    convertData.value = undefined
    schematicStr.value = undefined
    uniqueBlocks.value = undefined
    historyRecordData.value = undefined
}

// Dedup guard: selecting a schematic from the library and the tools-page
// fallback both call fetch_data for the same id — reuse the in-flight request
// instead of issuing it twice.
let fetchInFlight: { id: number; promise: Promise<void> } | null = null

export const fetch_data = async (id: number) => {
    if (fetchInFlight && fetchInFlight.id === id) {
        return fetchInFlight.promise
    }
    schematic_id.value = id
    const promise = (async () => {
        // History is deliberately NOT fetched here: it parses every past
        // requirements/blocks snapshot and is rarely viewed — the history
        // panel loads it on demand via fetch_history.
        const [data, conversions, requirements, blocks] = await Promise.all([
            fetchSchematic(id),
            fetchConvertData(id),
            fetchRequirementsWithStats(id),
            fetchUniqueBlocks(id),
        ])
        // A newer selection supersedes this result.
        if (schematic_id.value !== id) return
        schematicData.value = data
        convertData.value = conversions
        schematicRequirements.value = requirements
        uniqueBlocks.value = blocks
    })()
    fetchInFlight = {id, promise}
    try {
        await promise
    } finally {
        if (fetchInFlight?.id === id) fetchInFlight = null
    }
}

export const fetch_history = async (id: number) => {
    const history = await fetchHistoryRecord(id)
    if (schematic_id.value === id) {
        historyRecordData.value = history
    }
    return history
}

export const get_data = async (id: number) => {
    if (id == schematic_id.value){
        return schematicData.value
    }
    clear_tools()
    await fetch_data(id)
    return schematicData.value
}

export const get_requirements = async (id: number) => {
    if (id == schematic_id.value){
        return schematicRequirements.value
    }
    clear_tools()
    await fetch_data(id)
    return schematicRequirements.value
}
export async function fetchSchematicStr(
    schematicId: number
): Promise<string> {
    try {
        return await invoke<string>('get_schematic_str', {id: schematicId})
    } catch (error) {
        toast.error(`发生了一个错误:${error}`, {
            timeout: 3000
        });
        throw new Error(`err: ${error}`);
    }
}
