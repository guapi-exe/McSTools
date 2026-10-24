import {NavigationGuard} from "vue-router";

// Route transitions are handled globally by the page-level <Transition> in
// App.vue (see modules/page_transition.ts). This guard is kept only so views
// keep an explicit leave hook point; it never blocks navigation.
export const navigationGuard: NavigationGuard = (_to, _from, next) => {
    next()
}
