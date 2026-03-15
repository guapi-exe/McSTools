export declare type NoiseSettings = {
    minY: number;
    height: number;
    xzSize: number;
    ySize: number;
};
export declare namespace NoiseSettings {
    function fromJson(obj: any): NoiseSettings;
    function create(settings: Partial<NoiseSettings>): NoiseSettings;
    function cellHeight(settings: NoiseSettings): number;
    function cellWidth(settings: NoiseSettings): number;
    function cellCountY(settings: NoiseSettings): number;
    function minCellY(settings: NoiseSettings): number;
}
export declare type NoiseSlideSettings = {
    target: number;
    size: number;
    offset: number;
};
export declare namespace NoiseSlideSettings {
    function fromJson(obj: unknown): NoiseSlideSettings;
    function apply(slide: NoiseSlideSettings, density: number, y: number): number;
}
//# sourceMappingURL=NoiseSettings.d.ts.map