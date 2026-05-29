import type { RendererStats } from '../types';

export class PerfMonitor {
  private stats: RendererStats = {
    chunkSize: 16,
    chunkCount: 0,
    visibleChunks: 0,
    gpuChunks: 0,
    triangles: 0,
    drawCalls: 0,
    buildMs: 0,
    frameMs: 0,
  };

  snapshot() {
    return { ...this.stats };
  }

  update(next: Partial<RendererStats>) {
    this.stats = { ...this.stats, ...next };
  }

  measure<T>(field: 'buildMs' | 'frameMs', task: () => T): T {
    const start = performance.now();
    try {
      return task();
    } finally {
      this.stats[field] = performance.now() - start;
    }
  }

  async measureAsync<T>(field: 'buildMs' | 'frameMs', task: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await task();
    } finally {
      this.stats[field] = performance.now() - start;
    }
  }
}
