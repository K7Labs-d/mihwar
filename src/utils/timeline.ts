// Resolves cancelled waits so an interrupted walkthrough cannot resume later.
export function createTimeline() {
  const pending = new Map<ReturnType<typeof setTimeout>, (completed: boolean) => void>();
  return {
    wait(ms: number): Promise<boolean> {
      return new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(timer); resolve(true); }, ms);
        pending.set(timer, resolve);
      });
    },
    cancel() {
      for (const [timer, resolve] of pending) { clearTimeout(timer); resolve(false); }
      pending.clear();
    },
  };
}
