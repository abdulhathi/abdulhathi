// EventTarget is the browser's event API. Node has it too, as a global.
const door = new EventTarget();

door.addEventListener('knock', (event) => console.log(`first knock handler: ${event.type}`), { once: true });
door.addEventListener('knock', (event) => {
  const { who } = (event as CustomEvent<{ who: string }>).detail;
  console.log(`knock from ${who}`);
});

door.dispatchEvent(new CustomEvent('knock', { detail: { who: 'Ada' } }));
door.dispatchEvent(new CustomEvent('knock', { detail: { who: 'Grace' } }));

// AbortSignal is an EventTarget, which is how fetch, timers and once() learn about cancellation.
const controller = new AbortController();
controller.signal.addEventListener('abort', () => console.log(`aborted: ${controller.signal.reason}`));
controller.abort('user pressed cancel');
