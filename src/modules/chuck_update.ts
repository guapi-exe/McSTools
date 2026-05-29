import {check, type DownloadEvent, Update} from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {toast} from "./others.ts";
import {ref, shallowRef} from "vue";
import i18n from "../i18n";

export enum UpdateState {
    Pending,
    Downloading,
    Installing,
    Ready
}
export const restartDialog = ref(false);
export const updateDialog = ref(false);
export const chuckLoading = ref(false)
export const updateProgress = ref(0);
export const updateDownloadedBytes = ref(0);
export const updateTotalBytes = ref<number | null>(null);
export const updateDownloadSpeed = ref(0);
export const updateRemainingSeconds = ref<number | null>(null);
export const updateStatusText = ref('');
export const updateInfo = shallowRef<Update | null>(null);
export const updateState = ref(UpdateState.Pending);
export const restartCountdownSeconds = ref(3);

const SPEED_SMOOTHING_ALPHA = 0.2
let restartCountdownTimer: number | null = null

const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params)

const clearRestartCountdown = () => {
    if (restartCountdownTimer !== null) {
        window.clearInterval(restartCountdownTimer)
        restartCountdownTimer = null
    }
}

const startRestartCountdown = (seconds: number) => {
    clearRestartCountdown()
    restartCountdownSeconds.value = seconds

    restartCountdownTimer = window.setInterval(() => {
        if (restartCountdownSeconds.value <= 1) {
            clearRestartCountdown()
            restartCountdownSeconds.value = 0
            return
        }

        restartCountdownSeconds.value -= 1
    }, 1000)
}

const resetDownloadState = () => {
    updateProgress.value = 0
    updateDownloadedBytes.value = 0
    updateTotalBytes.value = null
    updateDownloadSpeed.value = 0
    updateRemainingSeconds.value = null
    updateStatusText.value = t('updater.status.waiting')
    restartCountdownSeconds.value = 3
    clearRestartCountdown()
}

const updateProgressFromBytes = () => {
    if (!updateTotalBytes.value || updateTotalBytes.value <= 0) {
        updateProgress.value = 0
        return
    }

    updateProgress.value = Math.min(
        Math.round((updateDownloadedBytes.value / updateTotalBytes.value) * 100),
        100
    )
}

const updateRemainingTimeEstimate = () => {
    if (!updateTotalBytes.value || updateDownloadSpeed.value <= 0) {
        updateRemainingSeconds.value = null
        return
    }

    const remainingBytes = Math.max(updateTotalBytes.value - updateDownloadedBytes.value, 0)
    updateRemainingSeconds.value = remainingBytes === 0
        ? 0
        : Math.ceil(remainingBytes / updateDownloadSpeed.value)
}

export const checkUpdate = async (auto: boolean) => {
    chuckLoading.value = true
    try {
        const update = await check();
        if (update) {
            toast.info(t('updater.toast.foundVersion', {
                version: update.version,
                date: update.date ?? '-',
                body: update.body ?? '-'
            }), {
                timeout: 3000
            });
            updateInfo.value = update;
            updateState.value = UpdateState.Pending;
            resetDownloadState()
            updateDialog.value = true;
        }
        if (!auto && !update){
            toast.info(t('updater.toast.noVersion'), {
                timeout: 3000
            });
        }
    } catch (error) {
        toast.error(t('updater.toast.checkFailed', { error }), {
            timeout: 3000
        });
        console.error('检查更新失败:', error);
    }
    finally {
        chuckLoading.value = false
    }
};

export const confirmUpdate = async () => {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const minimumInstallingAnimationMs = 900
    try {
        resetDownloadState()
        updateState.value = UpdateState.Downloading;
        updateStatusText.value = t('updater.status.preparing')
        const update = updateInfo.value ?? await check();

        if (!update) {
            toast.error(t('updater.toast.notAvailable'), {
                timeout: 3000
            })
            updateState.value = UpdateState.Pending;
            return
        }

        let lastSampleTime = Date.now()
        let lastSampleBytes = 0
        let installingStartedAt = 0

        await update.downloadAndInstall((event: DownloadEvent) => {
            if (event.event === 'Started') {
                updateTotalBytes.value = event.data.contentLength ?? null
                updateStatusText.value = event.data.contentLength
                    ? t('updater.status.downloading')
                    : t('updater.status.downloadingUnknownSize')
                updateRemainingSeconds.value = null
                lastSampleTime = Date.now()
                lastSampleBytes = 0
                return
            }

            if (event.event === 'Progress') {
                updateDownloadedBytes.value += Math.round(event.data.chunkLength)
                updateProgressFromBytes()

                const now = Date.now()
                const elapsed = now - lastSampleTime
                if (elapsed >= 250) {
                    const bytesDelta = updateDownloadedBytes.value - lastSampleBytes
                    const instantSpeed = Math.max(0, Math.round((bytesDelta * 1000) / elapsed))
                    updateDownloadSpeed.value = updateDownloadSpeed.value > 0
                        ? Math.round((SPEED_SMOOTHING_ALPHA * instantSpeed) + ((1 - SPEED_SMOOTHING_ALPHA) * updateDownloadSpeed.value))
                        : instantSpeed
                    lastSampleTime = now
                    lastSampleBytes = updateDownloadedBytes.value
                }

                updateRemainingTimeEstimate()
                return
            }

            updateState.value = UpdateState.Installing
            updateStatusText.value = t('updater.status.installing')
            updateDownloadSpeed.value = 0
            updateRemainingSeconds.value = 0
            installingStartedAt = Date.now()
            updateProgress.value = 100
            if (updateTotalBytes.value) {
                updateDownloadedBytes.value = updateTotalBytes.value
            }
        });

        if (installingStartedAt > 0) {
            const installingElapsed = Date.now() - installingStartedAt
            if (installingElapsed < minimumInstallingAnimationMs) {
                await delay(minimumInstallingAnimationMs - installingElapsed)
            }
        }

        updateState.value = UpdateState.Ready;
        updateStatusText.value = t('updater.status.installedAutoRestart', { seconds: 3 })
        updateDialog.value = false;
        restartDialog.value = true;
        startRestartCountdown(3)
        toast.info(t('updater.toast.restartingSoon'), {
            timeout: 3000
        });
        await delay(3000);
        clearRestartCountdown()
        await relaunch();
    } catch (error) {
        toast.error(t('updater.toast.downloadFailed', { error }), {
            timeout: 3000
        });

        console.error('更新下载失败:', error);
        updateState.value = UpdateState.Pending;
        updateRemainingSeconds.value = null
        clearRestartCountdown()
    }
};
