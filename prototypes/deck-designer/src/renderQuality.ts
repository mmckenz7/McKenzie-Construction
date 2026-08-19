export type RenderQuality = "economy" | "balanced" | "detailed";

export type RenderQualityPolicy = Readonly<{
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
}>;

export const RENDER_QUALITY_POLICIES: Readonly<Record<RenderQuality, RenderQualityPolicy>> = Object.freeze({
  economy: Object.freeze({ maxPixelRatio: 1, shadows: false, shadowMapSize: 512 }),
  balanced: Object.freeze({ maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024 }),
  detailed: Object.freeze({ maxPixelRatio: 2, shadows: true, shadowMapSize: 2048 }),
});
