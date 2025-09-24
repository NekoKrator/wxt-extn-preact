export class IdleTracker {
  private isIdle = false;
  private idleThreshold = 30;
  private callbacks: Array<(isIdle: boolean) => void> = [];
  private boundHandleIdleStateChange: (newState: string) => void;

  constructor(idleThreshold = 15) {
    this.idleThreshold = idleThreshold;
    this.boundHandleIdleStateChange = this.handleIdleStateChange.bind(this);
    this.init();
  }

  private init() {
    chrome.idle.setDetectionInterval(this.idleThreshold);
    chrome.idle.onStateChanged.addListener(this.boundHandleIdleStateChange);
    console.log(`IdleTracker initialized with ${this.idleThreshold}s threshold`);
  }

  private handleIdleStateChange(newState: string) {
    const wasIdle = this.isIdle;
    this.isIdle = newState !== 'active';

    console.log(`Idle state changed: ${newState} (was idle: ${wasIdle}, now idle: ${this.isIdle})`);

    if (wasIdle !== this.isIdle) {
      this.notifyCallbacks();
    }
  }

  private notifyCallbacks() {
    this.callbacks.forEach(callback => {
      try { callback(this.isIdle); }
      catch (error) { console.error('Error in idle callback:', error); }
    });
  }

  public onIdleChange(callback: (isIdle: boolean) => void) {
    this.callbacks.push(callback);
  }

  public offIdleChange(callback: (isIdle: boolean) => void) {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) this.callbacks.splice(index, 1);
  }

  public getIdleState(): boolean { return this.isIdle; }

  public async getCurrentIdleState(): Promise<'active' | 'idle' | 'locked'> {
    return new Promise(resolve => chrome.idle.queryState(this.idleThreshold, resolve));
  }

  public setIdleThreshold(seconds: number) {
    this.idleThreshold = seconds;
    chrome.idle.setDetectionInterval(this.idleThreshold);
    console.log(`Idle threshold updated to ${seconds}s`);
  }

  public cleanup() {
    this.callbacks = [];
    chrome.idle.onStateChanged.removeListener(this.boundHandleIdleStateChange);
    console.log('IdleTracker cleaned up');
  }
}
