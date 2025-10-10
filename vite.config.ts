import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from 'vite-plugin-vuetify'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({

    plugins: [
          vue(),
          viteCommonjs(),
          vuetify({
              autoImport: true,
          })
    ],

    clearScreen: false,
    server: {
        port: 1420,
        proxy: {
            '/asset': {
                target: 'http://localhost:3000',
                rewrite: path => path.replace(/^\/asset/, '')
            }
        },
        strictPort: true,
        host: host || false,
        hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
            }
        : undefined,
        watch: {
        ignored: ["**/src-tauri/**"],
        },
    },
        optimizeDeps: {
            exclude: [
                'vuetify',
            ],
        },
}
));
