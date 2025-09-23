
declare global {
  const browser: typeof chrome;

  interface Window {
    __activityTracker?: any;
  }

  var globalThis: typeof window;
}

export { };