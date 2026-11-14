// One reversible playhead keeps the lock, rim, tracks and nodes in step.
export const WHEEL_OPEN_SECONDS = 1.05;
export const WHEEL_CLOSE_SECONDS = 0.85;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const phase = (progress: number, start: number, end: number) =>
  ease(clamp((progress - start) / (end - start)));

export function getLockMotion(progress: number) {
  return {
    lift: -3 * phase(progress, 0, 0.16),
    angle: -32 * phase(progress, 0.16, 0.5),
    rotation: 36 * phase(progress, 0, 0.5),
    scale: 1 + 0.08 * phase(progress, 0, 0.5),
  };
}

export function getBranchReveal(progress: number, index: number) {
  const start = 0.52 + index * 0.055;
  return phase(progress, start, start + 0.26);
}

export function getShackleTransform(progress: number) {
  const { lift, angle } = getLockMotion(progress);
  // The left leg at (6, 18) remains seated in the body as the right leg opens.
  return `translateY(${lift}px) rotate(${angle}deg)`;
}
