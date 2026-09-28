import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, TIMING } from './liveMapSimulation';
const reducedQuery = '(prefers-reduced-motion: reduce)';
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia(reducedQuery).matches;

export function useLiveMapTimeline() {
  const [reduced, setReduced] = useState(prefersReduced);
  const [elapsed, setElapsed] = useState(() => prefersReduced() ? TIMING.duration : 0);
  const [playing, setPlaying] = useState(() => !prefersReduced());
  const time = useRef<number>(elapsed);
  useEffect(() => {
    const media = window.matchMedia(reducedQuery);
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (reduced) { time.current = TIMING.duration; setElapsed(TIMING.duration); setPlaying(false); }
  }, [reduced]);
  useEffect(() => {
    if (!playing || reduced) return;
    let frame = 0;
    let previous: number | null = null;
    let painted = 0;
    const resetClock = () => { previous = null; };
    const tick = (now: number) => {
      if (document.hidden) previous = null;
      else {
        const delta = previous === null ? 0 : Math.min(now - previous, 100);
        previous = now;
        time.current = clamp(time.current + delta, 0, TIMING.duration);
        // A short, finite scene at 30fps; no perpetual React animation loop.
        if (now - painted >= 30 || time.current >= TIMING.duration) {
          setElapsed(time.current); painted = now;
        }
        if (time.current >= TIMING.duration) { setPlaying(false); return; }
      }
      frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', resetClock);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resetClock); };
  }, [playing, reduced]);
  const seek = useCallback((value: number) => {
    time.current = clamp(value, 0, TIMING.duration); setElapsed(time.current); setPlaying(false);
  }, []);
  const replay = useCallback(() => {
    time.current = reduced ? TIMING.duration : 0; setElapsed(time.current); setPlaying(!reduced);
  }, [reduced]);
  const toggle = useCallback(() => {
    if (reduced) { seek(TIMING.duration); return; }
    if (time.current >= TIMING.duration) replay(); else setPlaying(value => !value);
  }, [reduced, replay, seek]);
  return { elapsed, playing, reduced, seek, replay, toggle };
}
