import { createRouter, createWebHistory } from 'vue-router'

// Keep route loaders in one place so the sidebar can prefetch a page before a
// click.  Dynamic imports are cached by the browser/bundler, so prefetching
// does not create a second copy of a route chunk.
const routeLoaders = {
    home: () => import('../src/views/homeViews.vue'),
    tools: () => import('../src/views/toolsViews.vue'),
    schematic: () => import('../src/views/schematicsViews.vue'),
    individuation: () => import('../src/views/individuationViews.vue'),
    report: () => import('../src/views/reportViews.vue'),
    about: () => import('../src/views/aboutViews.vue'),
    emptyRoute: () => import('../src/views/EmptyViews.vue'),
    others: () => import('../src/views/othersViews.vue'),
    setting: () => import('../src/views/settingViews.vue'),
}

export const preloadRoute = (name) => {
    const loader = routeLoaders[name]
    return loader ? loader() : Promise.resolve()
}

const HomeViews = routeLoaders.home
const ToolsViews = routeLoaders.tools
const SchematicViews = routeLoaders.schematic
const IndividuationViews = routeLoaders.individuation
const ReportViews = routeLoaders.report
const AboutViews = routeLoaders.about
const EmptyViews = routeLoaders.emptyRoute
const OthersViews = routeLoaders.others
const SettingViews = routeLoaders.setting
const routes = [
    {
        path: '/',
        redirect: '/home'
    },
    {
        path: '/home',
        name: 'home',
        meta: {
            title: 'Home',
            description: '',
            keywords: ''
        },
        component: HomeViews
    },
    {
        path: '/tools',
        name: 'tools',
        meta: {
            title: 'Tools',
            description: '',
            keywords: ''
        },
        component: ToolsViews
    },
    {
        path: '/schematic',
        name: 'schematic',
        meta: {
            title: 'Schematic',
            description: '',
            keywords: ''
        },
        component: SchematicViews
    },
    {
        path: '/individuation',
        name: 'individuation',
        meta: {
            title: 'individuation',
            description: '',
            keywords: ''
        },
        component: IndividuationViews
    },
    {
        path: '/report',
        name: 'report',
        meta: {
            title: 'report',
            description: '',
            keywords: ''
        },
        component: ReportViews
    },
    {
        path: '/about',
        name: 'about',
        meta: {
            title: 'about',
            description: '',
            keywords: ''
        },
        component: AboutViews
    },
    {
        path: '/others',
        name: 'others',
        meta: {
            title: 'others',
            description: '',
            keywords: ''
        },
        component: OthersViews
    },
    {
        path: '/setting',
        name: 'setting',
        meta: {
            title: 'setting',
            description: '',
            keywords: ''
        },
        component: SettingViews
    },
    {
        path: '/empty',
        name: 'emptyRoute',
        meta: {
            keepAlive: false,
        },
        component: EmptyViews
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

router.beforeEach((to, from, next) => {
    document.title = to.meta.title || 'Default Title'
    const description = to.meta.description || 'Default Description'
    const keywords = to.meta.keywords || 'default, keywords'

    let metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription) {
        metaDescription.setAttribute('content', description)
    } else {
        metaDescription = document.createElement('meta')
        metaDescription.name = 'description'
        metaDescription.content = description
        document.head.appendChild(metaDescription)
    }

    let metaKeywords = document.querySelector('meta[name="keywords"]')
    if (metaKeywords) {
        metaKeywords.setAttribute('content', keywords)
    } else {
        metaKeywords = document.createElement('meta')
        metaKeywords.name = 'keywords'
        metaKeywords.content = keywords
        document.head.appendChild(metaKeywords)
    }

    next()
})

export default router
