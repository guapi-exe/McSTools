import { createApp } from "vue";
import 'vuetify/styles'
import App from './App.vue'
import '@mdi/font/css/materialdesignicons.min.css'
// @ts-ignore
import router from '../router/index.js'
import {vuetify} from './plugins/vuetify.ts'
import Toast, { POSITION } from "vue-toastification";
import 'vue-toastification/dist/index.css'
import i18n from './i18n'

const installBrowserGuards = () => {
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault()
    }, { capture: true })

    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase()
        const hasMetaKey = event.ctrlKey || event.metaKey
        const shouldBlock =
            event.key === 'F5'
            || (hasMetaKey && key === 'r')
            || (hasMetaKey && key === 's')
            || event.key === 'BrowserBack'
            || event.key === 'BrowserForward'
            || (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'))

        if (!shouldBlock) {
            return
        }

        event.preventDefault()
        event.stopPropagation()
    }, { capture: true })
}

installBrowserGuards()

const app = createApp(App)
app.use(router)
app.use(vuetify)
app.use(i18n)
app.use(Toast, {
    position: POSITION.TOP_RIGHT
});
app.mount('#app')
