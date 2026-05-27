export const PX_PER_CM = 0.46
export const PX_PER_M = 46

export type ShadowCaster =
  | { id: string; label: string; type: 'rect'; x: number; y: number; width: number; height: number; heightCm: number; opacity?: number; excludeSelf?: boolean }
  | { id: string; label: string; type: 'circle'; cx: number; cy: number; radius: number; heightCm: number; opacity?: number; excludeSelf?: boolean }
  | { id: string; label: string; type: 'polygon'; points: [number, number][]; heightCm: number; opacity?: number; excludeSelf?: boolean }
