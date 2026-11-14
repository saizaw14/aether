import { useEffect, useRef, useState } from 'react'
import { createParticleRenderer } from './particles/renderer'
import type { Formation } from './particles/formations'
import type { InteractionSource } from './input/types'
import type { ParticleRenderer } from './particles/renderer'

interface Props { formation: Formation; strength: number; resetVersion: number; handInput: InteractionSource }
export default function ParticleScene({ formation, strength, resetVersion, handInput }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const engine = useRef<ParticleRenderer | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!host.current || !marker.current) return
    let mounted = true
    try { engine.current = createParticleRenderer(host.current, marker.current, () => setFailed(true), handInput) }
    catch { queueMicrotask(() => { if (mounted) setFailed(true) }) }
    return () => { mounted = false; engine.current?.dispose(); engine.current = null }
  }, [handInput])
  useEffect(() => { engine.current?.reset() }, [resetVersion])
  useEffect(() => { engine.current?.setFormation(formation) }, [formation, resetVersion])
  useEffect(() => { engine.current?.setStrength(strength) }, [strength, resetVersion])
  return <>
    <div className="particle-scene" ref={host} aria-hidden={failed} />
    <div className="interaction-marker" ref={marker} aria-hidden="true"><span /></div>
    {failed && <div className="graphics-error" role="alert"><h2>A little more space is needed.</h2><p>The particle renderer could not start or lost its graphics connection. Enable hardware acceleration in your browser, then reload Aether.</p><button onClick={() => window.location.reload()}>Reload experience ↗</button></div>}
  </>
}
