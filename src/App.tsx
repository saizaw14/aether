import { useEffect, useRef, useState } from 'react'
import ParticleScene from './ParticleScene'
import type { Formation } from './particles/formations'
import './App.css'

function App() {
  const [formation, setFormation] = useState<Formation>('nebula')
  const [strength, setStrength] = useState(0.65)
  const [resetVersion, setResetVersion] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [notice, setNotice] = useState('')
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen()
      else setNotice('Fullscreen is unavailable in this browser.')
    } catch { setNotice('Fullscreen could not open. Try expanding your browser window.') }
  }
  const reset = () => { setFormation('nebula'); setStrength(0.65); setResetVersion(v => v + 1); setNotice('Universe reset.'); }
  return <main className="universe" ref={root}>
    <ParticleScene formation={formation} strength={strength} resetVersion={resetVersion} />
    <div className="vignette" aria-hidden="true" />
    <header className="masthead">
      <a href="#" className="wordmark" aria-label="Aether home"><span className="brand-symbol">✧</span> aether<span className="brand-period">.</span></a>
      <div className="mode"><span /> Mouse mode <span className="mode-icon">↖</span></div>
    </header>
    <section className="intro" aria-label="About Aether"><p className="eyebrow">AN INTERACTIVE PARTICLE UNIVERSE</p><h1>Shape the universe<br />with your hands.</h1><p className="intro-description">A little curiosity. Infinite possibilities.</p></section>
    <div className="scene-caption" aria-hidden="true"><span className="caption-line" /><span>{formation === 'nebula' ? '01 / NEBULA' : '02 / GALAXY'}</span><small>5,000 points of possibility</small></div>
    <section className="control-dock" aria-label="Universe controls">
      <div className="formation-controls"><span className="control-label">FORMATION</span><div className="segmented" role="group" aria-label="Particle formation"><button aria-pressed={formation === 'nebula'} onClick={() => setFormation('nebula')}><span>✺</span> Nebula</button><button aria-pressed={formation === 'galaxy'} onClick={() => setFormation('galaxy')}><span>◎</span> Galaxy</button></div></div>
      <div className="strength-control"><label className="control-label" htmlFor="strength">INTERACTION <output htmlFor="strength">{Math.round(strength * 100)}%</output></label><input id="strength" type="range" min="0" max="1" step="0.01" value={strength} aria-label="Interaction strength" onChange={e => setStrength(Number(e.target.value))} /></div>
      <div className="dock-actions"><button className="icon-button" onClick={reset} title="Reset universe" aria-label="Reset universe">↺</button><button className="icon-button fullscreen-button" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? '⊡' : '⛶'}</button></div>
    </section>
    <footer><p className="instruction"><span className="mouse-outline" aria-hidden="true" />Hold and drag to gather particles.</p><span className="milestone">EXPERIMENT 001 <span>·</span> THE BEGINNING</span></footer>
    <p className="notice" role="status">{notice}</p>
  </main>
}
export default App
