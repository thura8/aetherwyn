export function createLifecycle() {
  let isRunning = true;
  const removeListeners: (() => void)[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  return {
    isRunning: () => isRunning,
    listen<TEvent extends Event = Event>(
      target: EventTarget,
      type: string,
      handler: (event: TEvent) => void,
      options?: AddEventListenerOptions,
    ) {
      const listener = handler as EventListener;
      target.addEventListener(type, listener, options);
      removeListeners.push(() =>
        target.removeEventListener(type, listener, options),
      );
    },
    /** Like setTimeout, but never fires after the experience stops. */
    after(callback: () => void, milliseconds: number) {
      const timer = setTimeout(() => {
        if (isRunning) callback();
      }, milliseconds);
      timers.push(timer);
      return timer;
    },
    stop() {
      isRunning = false;
      removeListeners.splice(0).forEach((remove) => remove());
      timers.splice(0).forEach((timer) => clearTimeout(timer));
    },
  };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;
