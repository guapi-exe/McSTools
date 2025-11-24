import {invoke} from '@tauri-apps/api/core';

export interface SchematicPartFile {
    index: number;
    size: SizeInfo;
    file: File;
}
interface SizeInfo {
    width: number;
    height: number;
    length: number;
}

interface SchematicReplacementParams {
    schematicId: number;
    splitType: number;
    splitNumber: number;
    airFrame: boolean;
    vType?: number;
}

const getExtensions = (type: number): string => {
    switch (type) {
        case 1: return '.nbt';
        case 2: return '.litematic';
        case 3: return '.schem';
        case 4: return '.json';
        case 5: return '.mcstructure';
        default: return '.unknown';
    }
};
export const splitSchematicParts = async (
    params: SchematicReplacementParams
): Promise<SchematicPartFile[]> => {
    try {
        const parts = await invoke<[]>(`schematic_split`, {
            schematicId: params.schematicId,
            splitType: params.splitType,
            splitNumber: params.splitNumber,
            airFrame: params.airFrame,
            vType: params.vType,
        });

        const sqrt = Math.sqrt(params.splitNumber);
        const extension = getExtensions(params.vType);

        return parts.map(part => {
            const index = part[0];
            const uint8Array = new Uint8Array(part[2]);

            let fileName: string;

            if (params.splitType === 3 && Number.isInteger(sqrt)) {
                const row = Math.floor(index / sqrt) + 1;
                const col = (index % sqrt) + 1;
                fileName = `schematic_part_${row}*${col}${extension}`;
            } else {
                fileName = `schematic_part_${index}${extension}`;
            }

            const file = new File([uint8Array], fileName);

            return {
                index,
                size: part[1],
                file,
            };
        });
    } catch (err) {
        console.error('处理示意图时出错:', err);
        throw err;
    }
};
