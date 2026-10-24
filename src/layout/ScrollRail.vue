<template>
  <div
      ref="trackEl"
      class="scroll-rail"
      :class="{ 'scroll-rail--visible': isVisible }"
      :style="position === 'left' ? { left: offset } : { right: offset }"
      @pointerdown="onTrackPointerDown"
  >
    <div
        class="scroll-rail__thumb"
        :class="{ 'scroll-rail__thumb--active': dragging }"
        :style="{ height: thumbHeightPct + '%', transform: `translateY(${thumbOffsetPx}px)` }"
        @pointerdown.stop="onThumbPointerDown"
    ></div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";

// Overlay scroll indicator for pages whose native scrollbars are hidden.
// Mirrors (and drives) the scroll position of `target` — the app shell page
// scroller or an inner list such as the blueprint library.
//
// Visibility follows macOS overlay-scrollbar behaviour: it fades in while the
// target scrolls, fades out after ~1s idle, and also fades in when the pointer
// comes close so it can be grabbed. While hidden it is pointer-events:none and
// never blocks the content underneath.
const props = withDefaults(defineProps<{
  target: string;
  position?: 'left' | 'right';
  offset?: string;
}>(), {
  position: 'left',
  offset: '0px',
});

const trackEl = ref<HTMLElement | null>(null);
const active = ref(false);
const near = ref(false);
const dragging = ref(false);
const thumbHeightPct = ref(20);
const thumbOffsetPx = ref(0);
let thumbTravel = 1;

const isVisible = computed(() => active.value || near.value || dragging.value);

const getTarget = (): HTMLElement | null =>
    document.querySelector(props.target) as HTMLElement | null;

const update = () => {
  const el = getTarget();
  const track = trackEl.value;
  if (!el || !track) return;
  lastTop = el.scrollTop;
  const scrollable = el.scrollHeight - el.clientHeight;
  if (scrollable <= 4) return;
  thumbHeightPct.value = Math.max(5, (el.clientHeight / el.scrollHeight) * 100);
  const trackHeight = track.clientHeight;
  const thumbPx = (thumbHeightPct.value / 100) * trackHeight;
  thumbTravel = Math.max(1, trackHeight - thumbPx);
  thumbOffsetPx.value = (el.scrollTop / scrollable) * thumbTravel;
};

let fadeTimer: ReturnType<typeof setTimeout> | null = null;
const bumpActivity = () => {
  active.value = true;
  if (fadeTimer !== null) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    fadeTimer = null;
    active.value = false;
  }, 1000);
};

const setScrollFromThumbTop = (topPx: number) => {
  const el = getTarget();
  const track = trackEl.value;
  if (!el || !track) return;
  const scrollable = el.scrollHeight - el.clientHeight;
  const thumbPx = (thumbHeightPct.value / 100) * track.clientHeight;
  const top = Math.max(0, Math.min(track.clientHeight - thumbPx, topPx));
  thumbOffsetPx.value = top;
  el.scrollTop = (top / Math.max(1, track.clientHeight - thumbPx)) * scrollable;
};

const onThumbPointerDown = (e: PointerEvent) => {
  const track = trackEl.value;
  if (!track) return;
  const trackRect = track.getBoundingClientRect();
  const thumbRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const grabOffset = e.clientY - thumbRect.top;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    setScrollFromThumbTop(ev.clientY - trackRect.top - grabOffset);
  };
  const onUp = () => {
    dragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};

const onTrackPointerDown = (e: PointerEvent) => {
  const track = trackEl.value;
  if (!track || e.target !== trackEl.value) return;
  const rect = track.getBoundingClientRect();
  const thumbPx = (thumbHeightPct.value / 100) * rect.height;
  setScrollFromThumbTop(e.clientY - rect.top - thumbPx / 2);
};

// Only react to scroll events that actually moved our target — inner scrollers
// elsewhere on the page should not pop this rail in.
let lastTop = -1;

let bodyObserver: ResizeObserver | null = null;

// Coalesce bursts (scroll streams, route-change reflows) into at most one
// DOM-measuring update per frame.
let updateFrame: number | null = null;
const scheduleUpdate = () => {
  if (updateFrame !== null) return;
  updateFrame = requestAnimationFrame(() => {
    updateFrame = null;
    update();
  });
};

const onAnyScroll = () => {
  const el = getTarget();
  if (!el || el.scrollTop === lastTop) return;
  scheduleUpdate();
  bumpActivity();
};

// Proximity reveal so the rail can be grabbed without scrolling first.
let cachedRect: DOMRect | null = null;
let moveFrame: number | null = null;
const refreshRect = () => {
  cachedRect = trackEl.value ? trackEl.value.getBoundingClientRect() : null;
};
const onPointerMove = (e: MouseEvent) => {
  if (moveFrame !== null) return;
  moveFrame = requestAnimationFrame(() => {
    moveFrame = null;
    if (!cachedRect) refreshRect();
    if (!cachedRect) {
      near.value = false;
      return;
    }
    near.value = e.clientX >= cachedRect.left - 16 && e.clientX <= cachedRect.right + 16
        && e.clientY >= cachedRect.top - 16 && e.clientY <= cachedRect.bottom + 16;
  });
};

const onResize = () => {
  refreshRect();
  scheduleUpdate();
};

onMounted(() => {
  document.addEventListener('scroll', onAnyScroll, {capture: true, passive: true});
  window.addEventListener('pointermove', onPointerMove, {passive: true});
  window.addEventListener('resize', onResize);
  // Content appearing/disappearing (route switches, loaded lists) changes the
  // scrollable area and the rail position without a scroll event.
  bodyObserver = new ResizeObserver(() => {
    refreshRect();
    scheduleUpdate();
  });
  bodyObserver.observe(document.body);
  refreshRect();
  update();
});

onUnmounted(() => {
  document.removeEventListener('scroll', onAnyScroll, {capture: true});
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('resize', onResize);
  bodyObserver?.disconnect();
  bodyObserver = null;
  if (fadeTimer !== null) clearTimeout(fadeTimer);
  if (moveFrame !== null) cancelAnimationFrame(moveFrame);
  if (updateFrame !== null) cancelAnimationFrame(updateFrame);
});
</script>

<style scoped>
.scroll-rail {
  position: fixed;
  top: 16px;
  bottom: 16px;
  width: 14px;
  z-index: 1200;
  display: flex;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 400ms var(--ease-standard);
}

.scroll-rail--visible {
  opacity: 1;
  pointer-events: auto;
}

.scroll-rail__thumb {
  width: 4px;
  min-height: 32px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.28);
  transition:
      width var(--motion-fast) var(--ease-standard),
      background-color var(--motion-fast) var(--ease-standard);
}

.scroll-rail:hover .scroll-rail__thumb,
.scroll-rail__thumb--active {
  width: 6px;
  background: rgba(var(--v-theme-on-surface), 0.45);
}

@media (prefers-reduced-motion: reduce) {
  .scroll-rail,
  .scroll-rail__thumb {
    transition: none;
  }
}
</style>
