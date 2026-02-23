import { createRouter, createWebHistory } from 'vue-router'

const HomeViews = () => import('../src/views/homeViews.vue')
const ToolsViews = () => import('../src/views/toolsViews.vue')
const SchematicViews = () => import('../src/views/schematicsViews.vue')
const IndividuationViews = () => import('../src/views/individuationViews.vue')
const ReportViews = () => import('../src/views/reportViews.vue')
const AboutViews = () => import('../src/views/aboutViews.vue')
const EmptyViews = () => import('../src/views/EmptyViews.vue')
const OthersViews = () => import('../src/views/othersViews.vue')
const SettingViews = () => import('../src/views/settingViews.vue')
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
