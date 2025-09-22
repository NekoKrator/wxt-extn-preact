import { sendMessage } from '../shared/utils/messaging'

export class ContentTracker {
  private isVisible = !document.hidden;
  private lastUrl = window.location.href;
  private visibilityObserver?: IntersectionObserver;
  private isInitialized = false;

  constructor() {
    this.init()
  }

  private init() {
    if (this.isInitialized) {
      return
    }

    if (this.shouldSkipTracking()) {
      return
    }

    this.isInitialized = true;
    console.log(`Content Script started for: ${window.location.href}`);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupTracking()
      })
    } else {
      this.setupTracking()
    }
  }

  private shouldSkipTracking(): boolean {
    const url = window.location.href
    const protocol = window.location.protocol

    if (protocol === 'chrome:' ||
      protocol === 'chrome-extension:' ||
      protocol === 'moz-extension:' ||
      url.includes('chrome://') ||
      url.includes('about:')) {
      return true
    }

    return false
  }

  private setupTracking() {
    this.sendPageView();
    this.setupEventListeners();
    this.setupIntersectionObserver();
    this.setupSPATracking();
  }

  private sendPageView() {
    sendMessage('PAGE_VIEW', {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer || undefined
    }).catch(error => {
      console.warn('Failed to send page view:', error)
    })
  }

  private setupEventListeners() {
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      if (visible !== this.isVisible) {
        this.isVisible = visible;
        this.sendVisibilityChange(visible, 'visibility_change')
      }
    }, { passive: true })

    window.addEventListener('beforeunload', () => {
      this.sendVisibilityChange(false, 'before_unload')
    })

    window.addEventListener('focus', () => {
      if (!this.isVisible) {
        this.isVisible = true
        this.sendVisibilityChange(true, 'window_focus')
      }
    }, { passive: true })

    window.addEventListener('blur', () => {
      if (this.isVisible) {
        this.isVisible = false
        this.sendVisibilityChange(false, 'window_blur')
      }
    }, { passive: true })

    window.addEventListener('pagehide', () => {
      this.sendVisibilityChange(false, 'page_hide')
    })

    window.addEventListener('pageshow', (event) => {
      this.sendVisibilityChange(true, event.persisted ? 'page_show_cached' : 'page_show')
    })
  }

  private sendVisibilityChange(visible: boolean, reason: string) {
    sendMessage('VISIBILITY_CHANGE', {
      visible,
      url: window.location.href,
      reason
    }).catch(error => {
      console.warn('Failed to send visibility change:', error)
    })
  }

  private setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      return
    }

    try {
      this.visibilityObserver = new IntersectionObserver((entries) => {
        const maxVisibility = Math.max(...entries.map(e => e.intersectionRatio))

        if (maxVisibility === 0 && this.isVisible) {
          this.isVisible = false
          this.sendVisibilityChange(false, 'intersection_hidden')
        } else if (maxVisibility > 0.1 && !this.isVisible) {
          this.isVisible = true
          this.sendVisibilityChange(true, 'intersection_visible')
        }
      }, {
        threshold: [0, 0.1, 0.5, 1.0],
        rootMargin: '0px'
      })

      const target = document.body || document.documentElement
      if (target) {
        this.visibilityObserver.observe(target)
      }
    } catch (error) {
      console.warn('Failed to setup intersection observer:', error)
    }
  }

  private setupSPATracking() {
    let currentUrl = window.location.href;

    const checkUrlChange = () => {
      const newUrl = window.location.href
      if (newUrl !== currentUrl) {
        const from = currentUrl;
        currentUrl = newUrl;
        this.lastUrl = currentUrl;

        console.log(`SPA navigation detected: ${from} -> ${newUrl}`)

        sendMessage('INTERACTION', {
          interactionType: 'spa_navigation',
          url: currentUrl,
          details: {
            from,
            to: currentUrl,
            timestamp: Date.now(),
            trigger: 'url_change'
          }
        }).catch(console.warn);

        setTimeout(() => {
          this.sendPageView()
        }, 100);
      }
    }

    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(checkUrlChange, 0);
    }

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(checkUrlChange, 0);
    }

    // Для некоторых фреймворков также слушаем кастомные события
    ['routechange', 'navigationend', 'urlchange'].forEach(eventName => {
      window.addEventListener(eventName, checkUrlChange, { passive: true })
    })
  }

  public cleanup() {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = undefined;
    }
    this.isInitialized = false;
    console.log('Content tracker cleaned up')
  }
}

// Глобальная переменная для трекера
let tracker: ContentTracker | undefined;

function initTracker() {
  // Очищаем предыдущий трекер если есть
  if (tracker) {
    tracker.cleanup()
  }

  // Создаем новый трекер
  tracker = new ContentTracker();

  // Добавляем в глобальную область для отладки
  (window as any).__activityTracker = tracker;
}

// Инициализация в зависимости от состояния документа
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTracker);
} else {
  // DOM уже загружен
  initTracker();
}

// Дополнительная проверка на случай если DOMContentLoaded не сработал
window.addEventListener('load', () => {
  if (!tracker) {
    initTracker();
  }
});

// Экспортируем для использования в других модулях
export { tracker };