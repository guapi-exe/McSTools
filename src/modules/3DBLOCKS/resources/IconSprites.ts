// Lightweight shared icon registry. General UI helpers must not import the
// renderer/resource loader just to look up an icon.
export const blockIconSpriteMap: Record<string, {atlasUrl: string; uv: [number, number, number, number]}> = {};
