export interface FormationTransform { active: boolean; scale: number; rotation: number }

/** Normalized viewport coordinates (Y up), shared by every input adapter. */
export interface InteractionInput {
  x: number
  y: number
  active: boolean
  visible: boolean
  /** Optional continuous weights let adapters fade without changing particle physics. */
  attraction?: number
  opacity?: number
  transform?: FormationTransform
}
export interface InteractionSource {
  sample(now: number, dt: number, aspect?: number): InteractionInput
  reset(): void
  /** Cancel a live gesture while retaining a previously chosen formation transform. */
  interrupt?(): void
}
