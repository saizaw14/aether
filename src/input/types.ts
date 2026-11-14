/** Normalized viewport coordinates (Y up), shared by every input adapter. */
export interface InteractionInput {
  x: number
  y: number
  active: boolean
  visible: boolean
  /** Optional continuous weights let adapters fade without changing particle physics. */
  attraction?: number
  opacity?: number
}
export interface InteractionSource {
  sample(now: number, dt: number): InteractionInput
  reset(): void
}
