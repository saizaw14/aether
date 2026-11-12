export type Formation = 'nebula' | 'galaxy'
export const PARTICLE_COUNT = 5000

// Seeded layouts keep reset and formation changes predictable.
export function generateFormation(kind: Formation, count = PARTICLE_COUNT) {
  let seed = 731
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const radius = Math.pow(random(), kind === 'galaxy' ? 1.45 : 0.55) * 5.6
    const angle = kind === 'galaxy'
      ? (i % 3) * Math.PI * 2 / 3 + radius * 0.9 + (random() - 0.5) * (0.3 + radius * 0.09)
      : random() * Math.PI * 2 + radius * 0.4
    const spread = kind === 'nebula' ? 1 : 0.28
    positions[i * 3] = Math.cos(angle) * radius * 1.12
    positions[i * 3 + 1] = Math.sin(angle) * radius * 0.64 + (random() - 0.5) * spread
    positions[i * 3 + 2] = (random() - 0.5) * (kind === 'nebula' ? 3.3 : 0.7) + Math.sin(angle) * radius * 0.2
  }
  return positions
}
