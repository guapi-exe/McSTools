import { LazyStore } from '@tauri-apps/plugin-store';

class AppStore {
    private store: LazyStore;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.store = new LazyStore('settings.json');
    }

    async get<T>(key: string, defaultValue: T): Promise<T> {
        const value = await this.store.get(key);
        return value !== undefined ? (value as T) : defaultValue;
    }

    async set<T>(key: string, value: T): Promise<void> {
        await this.store.set(key, value);
        await this.store.save();
    }

    // For high-frequency inputs (sliders): every write updates the in-memory
    // store, but the disk save is debounced so dragging does not flush once
    // per pixel.
    async setDebounced<T>(key: string, value: T, delay = 300): Promise<void> {
        await this.store.set(key, value);
        if (this.saveTimer !== null) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.store.save();
        }, delay);
    }
}

export const appStore = new AppStore();