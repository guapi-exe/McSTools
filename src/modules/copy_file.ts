import {invoke} from "@tauri-apps/api/core";
import {save, open} from "@tauri-apps/plugin-dialog";
import {toast} from "./others.ts";
import { appConfigDir, join } from '@tauri-apps/api/path';
import { openPath } from '@tauri-apps/plugin-opener';
const getExtensions = (type: number): string[] => {
    switch (type) {
        case 1: return ['nbt'];
        case 2: return ['litematic'];
        case 3: return ['schem'];
        case 4: return ['json'];
        case 5: return ['mcstruct'];
        default: return ['unknown'];
    }
};

export const copySchematic = async (id: number, sub: number, version: number, type: number) => {
    try {
        const path = await save({
            filters: [
                {
                    name: 'Schematic File',
                    extensions: getExtensions(type),
                },
            ],
        });

        if (!path) {
            toast.error(`未选择目标目录`, { timeout: 3000 });
            return;
        }
        console.log(path)
        const result = await invoke('copy_schematic', {
            id: id,
            sub: sub,
            version: version,
            vType: type,
            target: path
        });

        if (result) {
            toast.success(`复制成功！`, { timeout: 3000 });
        }
    } catch (error) {
        console.error('复制失败:', error);
        toast.error(`复制失败: ${error}`, { timeout: 3000 });
    }
};

export const openData = async () => {
    try {
        const appConfigDirPath = await appConfigDir();
        await openPath(appConfigDirPath);
    } catch (error) {
        console.error('打开失败:', error);
        toast.error(`打开失败: ${error}`, { timeout: 3000 });
    }
};

// 批量导出
export const batchExportSchematics = async (blueprints: {
    id: number;
    sub_type: number;
    version: number;
    schematic_type: number;
    name: string;
}[]) => {
    try {
        const dir = await open({
            directory: true,
            multiple: false,
            defaultPath: await appConfigDir(),
        });

        if (!dir) {
            toast.error(`未选择目标目录`, { timeout: 3000 });
            return;
        }

        for (const bp of blueprints) {
            const ext = getExtensions(bp.schematic_type)[0];
            const fileName = `${bp.name}.${ext}`;
            const targetPath = await join(dir as string, fileName);

            try {
                await copySchematicTo(
                    bp.id,
                    bp.sub_type,
                    bp.version,
                    bp.schematic_type,
                    targetPath
                );
            } catch (e) {
                console.error(`导出失败: ${bp.name}`, e);
                toast.error(`导出失败: ${bp.name}`, { timeout: 2000 });
            }
        }

        toast.success(`已批量导出 ${blueprints.length} 个蓝图！`, { timeout: 3000 });
    } catch (error) {
        console.error("批量导出失败:", error);
        toast.error(`批量导出失败: ${error}`, { timeout: 3000 });
    }
};

const copySchematicTo = async (
    id: number,
    sub: number,
    version: number,
    type: number,
    targetPath: string
) => {
    return invoke("copy_schematic", {
        id,
        sub,
        version,
        vType: type,
        target: targetPath,
    });
};