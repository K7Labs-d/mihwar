/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Synthesized Web Audio API sound generator for tactile mechanical interactions.
 * Zero external audio file dependencies - works instantly offline with ultra-low latency.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * State 02: Tactile Button Press (satisfying mechanical switch depression)
   */
  public playPressDown() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Fast tactile metallic impulse
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.04);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.Q.setValueAtTime(3, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * State 03: High-tech Unlock Sequence:
   * 1) Mechanical shackle spring release (metallic dual click)
   * 2) Pneumatic decompression / air release
   * 3) Radiant harmonic chime (golden energy shimmer)
   */
  public playUnlockSequence() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Shackle Latch Release (Dual metallic click)
    [0, 0.04].forEach((offset, idx) => {
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      const clickFilter = ctx.createBiquadFilter();

      clickOsc.type = idx === 0 ? 'square' : 'triangle';
      clickOsc.frequency.setValueAtTime(idx === 0 ? 1200 : 850, now + offset);
      clickOsc.frequency.exponentialRampToValueAtTime(240, now + offset + 0.04);

      clickFilter.type = 'highpass';
      clickFilter.frequency.setValueAtTime(700, now + offset);

      clickGain.gain.setValueAtTime(0.22, now + offset);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);

      clickOsc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(ctx.destination);

      clickOsc.start(now + offset);
      clickOsc.stop(now + offset + 0.06);
    });

    // 2. Pneumatic Decompression (Soft white noise whoosh)
    try {
      const bufferSize = ctx.sampleRate * 0.35;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1800, now + 0.05);
      noiseFilter.frequency.exponentialRampToValueAtTime(400, now + 0.35);
      noiseFilter.Q.setValueAtTime(2.5, now + 0.05);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now + 0.05);
      noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.12);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now + 0.05);
      whiteNoise.stop(now + 0.4);
    } catch {
      // Ignore if buffer generation issues occur in sandboxed browser
    }

    // 3. Golden Energy Resonance (Harmonic chords 528Hz & 792Hz & 1056Hz)
    const frequencies = [528, 792, 1056];
    frequencies.forEach((freq, idx) => {
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();

      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(freq, now + 0.1);
      chimeOsc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + 0.6);

      const startDelay = 0.08 + idx * 0.03;
      chimeGain.gain.setValueAtTime(0.001, now + startDelay);
      chimeGain.gain.linearRampToValueAtTime(0.15 / (idx + 1), now + startDelay + 0.05);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + startDelay + 0.7);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);

      chimeOsc.start(now + startDelay);
      chimeOsc.stop(now + startDelay + 0.75);
    });
  }

  /**
   * State 04: Branch Deployment Whoosh (smooth radial expansion)
   */
  public playBranchesExpand() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Ascending arpeggio of 5 nodes unfolding
    const notes = [440, 554.37, 659.25, 830.61, 987.77];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      const t = now + i * 0.06;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /**
   * State 05: Branch Hover (gentle crystalline feedback ping)
   */
  public playBranchHover() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * State 06: Lock Shut clack (vault relocking securely)
   */
  public playLockShut() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Heavy vault thud
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(140, now);
    bassOsc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

    bassGain.gain.setValueAtTime(0.25, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    bassOsc.connect(bassGain);
    bassGain.connect(ctx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 0.16);

    // Mechanical latch latch-in click
    const latchOsc = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(750, now);
    latchOsc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    latchGain.gain.setValueAtTime(0.18, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    latchOsc.connect(latchGain);
    latchGain.connect(ctx.destination);
    latchOsc.start(now);
    latchOsc.stop(now + 0.08);
  }
}

export const soundEngine = new SoundEngine();
