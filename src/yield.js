let channel = null;

export function yieldToEventLoop() {
  if (typeof setImmediate === 'function') {
    return new Promise((resolve) => setImmediate(resolve));
  }
  if (typeof MessageChannel !== 'undefined') {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => channel._resolver && channel._resolver();
    }
    return new Promise((resolve) => {
      channel._resolver = resolve;
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
