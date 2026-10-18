import {ref} from "vue";
import type {RouteLocationNormalized} from "vue-router";

// Sidebar order drives the slide direction: moving down the list slides the
// new page in from the right, moving up mirrors it. Routes outside this list
// (first load, the /empty helper route) get no animation.
const NAV_ORDER = ['home', 'tools', 'schematic', 'others', 'individuation', 'report', 'about', 'setting'];

// Pages whose layout relies on position:fixed children (the full-screen
// schematic library) cannot be animated with a transform: a transformed
// ancestor becomes the containing block for fixed descendants and the page
// would jump. Those routes use a transform-free swap.
const FIXED_LAYOUT_ROUTES = new Set(['schematic']);

// KeepAlive-cached pages whose DOM is huge once real data is loaded (the
// tools editor keeps every visited tool panel mounted). Re-inserting that
// subtree into a transformed, will-change layer is the main source of
// route-switch jank, so navigation involving these pages swaps instead of
// sliding. Slides stay for the light pages.
const HEAVY_ROUTES = new Set(['tools', ...FIXED_LAYOUT_ROUTES]);

export type PageTransitionName = 'page-forward' | 'page-backward' | 'page-fade' | 'page-none';

export const transitionName = ref<PageTransitionName>('page-none');

const scrollMemories = new Map<string, number>();
let pendingScrollTop: number | null = null;

export const onPageChange = (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
    const toName = String(to.name ?? '');
    const fromName = String(from.name ?? '');
    const toIndex = NAV_ORDER.indexOf(toName);
    const fromIndex = NAV_ORDER.indexOf(fromName);

    // Remember where the user left the outgoing page so "back" can restore it.
    if (fromName) {
        const container = getScrollContainer();
        if (container) scrollMemories.set(fromName, container.scrollTop);
    }

    if (toIndex === -1 || fromIndex === -1 || toIndex === fromIndex) {
        transitionName.value = 'page-none';
    } else if (HEAVY_ROUTES.has(toName) || HEAVY_ROUTES.has(fromName)) {
        transitionName.value = 'page-fade';
    } else if (!FIXED_LAYOUT_ROUTES.has(toName) && !FIXED_LAYOUT_ROUTES.has(fromName)) {
        transitionName.value = toIndex > fromIndex ? 'page-forward' : 'page-backward';
    } else {
        transitionName.value = 'page-fade';
    }

    // Cached routes retain their scroll position regardless of whether the
    // route uses a slide or a fixed-layout settle transition.
    const saved = scrollMemories.get(toName);
    pendingScrollTop = saved ?? 0;
};

// Apply after the incoming DOM is inserted, before its first visible frame.
export const applyPendingScroll = () => {
    if (pendingScrollTop === null) return;
    const container = getScrollContainer();
    if (container) container.scrollTop = pendingScrollTop;
    pendingScrollTop = null;
};

const getScrollContainer = (): HTMLElement | null => {
    return document.querySelector('.scroll-container') as HTMLElement | null;
};
