import { useEffect, useState } from 'react'
import type { PerformanceMonitor } from './performance/monitor'
export default function DebugOverlay({ monitor }: { monitor: PerformanceMonitor }) {
  const [sample, setSample] = useState(() => monitor.snapshot(performance.now()))
  useEffect(() => {
    const timer = window.setInterval(() => setSample(monitor.snapshot(performance.now())), 500)
    return () => window.clearInterval(timer)
  }, [monitor])
  return <aside className="debug-overlay" aria-label="Performance debug overlay">
    <span className="control-label">PERFORMANCE · 2 HZ DISPLAY</span>
    <dl>
      <div><dt>Rendering</dt><dd>{sample.fps.toFixed(0)} FPS</dd></div>
      <div><dt>Tracking</dt><dd>{sample.trackingHz.toFixed(1)} Hz</dd></div>
      <div><dt>Inference</dt><dd>{sample.inferenceMs === null ? '—' : `${sample.inferenceMs.toFixed(1)} ms`}</dd></div>
      <div><dt>Active input</dt><dd>{sample.mode}</dd></div>
      <div><dt>Quality</dt><dd>{sample.quality} · {sample.particles.toLocaleString()} points</dd></div>
    </dl>
  </aside>
}
