/**
 * @class IdleTracker
 * 
 * Отслеживает состояние активности пользователя и управляет idle состоянием
 * Работает совместно с TabManager для корректного учета времени активности
 */
export class IdleTracker {
  private isIdle = false
  private idleThreshold = 30 // секунд
  private callbacks: Array<(isIdle: boolean) => void> = []

  constructor(idleThreshold = 30) {
    this.idleThreshold = idleThreshold
    this.init()
  }

  private init() {
    // Устанавливаем интервал проверки idle состояния
    browser.idle.setDetectionInterval(this.idleThreshold)

    // Слушаем изменения idle состояния
    browser.idle.onStateChanged.addListener(this.handleIdleStateChange.bind(this))

    console.log(`IdleTracker initialized with ${this.idleThreshold}s threshold`)
  }

  private handleIdleStateChange(newState: Browser.idle.IdleState) {
    const wasIdle = this.isIdle
    this.isIdle = newState !== 'active'

    console.log(`Idle state changed: ${newState} (was idle: ${wasIdle}, now idle: ${this.isIdle})`)

    // Уведомляем подписчиков только при реальном изменении
    if (wasIdle !== this.isIdle) {
      this.notifyCallbacks()
    }
  }

  private notifyCallbacks() {
    this.callbacks.forEach(callback => {
      try {
        callback(this.isIdle)
      } catch (error) {
        console.error('Error in idle callback:', error)
      }
    })
  }

  /**
   * Подписаться на изменения idle состояния
   */
  public onIdleChange(callback: (isIdle: boolean) => void) {
    this.callbacks.push(callback)
  }

  /**
   * Отписаться от изменений idle состояния
   */
  public offIdleChange(callback: (isIdle: boolean) => void) {
    const index = this.callbacks.indexOf(callback)
    if (index !== -1) {
      this.callbacks.splice(index, 1)
    }
  }

  /**
   * Получить текущее состояние
   */
  public getIdleState(): boolean {
    return this.isIdle
  }

  /**
   * Получить текущее состояние асинхронно
   */
  public async getCurrentIdleState(): Promise<'active' | 'idle' | 'locked'> {
    return new Promise((resolve) => {
      browser.idle.queryState(this.idleThreshold, resolve)
    })
  }

  /**
   * Установить новый порог idle времени
   */
  public setIdleThreshold(seconds: number) {
    this.idleThreshold = seconds
    browser.idle.setDetectionInterval(this.idleThreshold)
    console.log(`Idle threshold updated to ${seconds}s`)
  }

  /**
   * Очистка ресурсов
   */
  public cleanup() {
    this.callbacks = []
    browser.idle.onStateChanged.removeListener(this.handleIdleStateChange.bind(this))
    console.log('IdleTracker cleaned up')
  }
}