export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    // Проверяем, что мы не на системных страницах
    if (location.protocol.startsWith('chrome') ||
      location.protocol.startsWith('moz-extension') ||
      location.href.includes('chrome://') ||
      location.href.includes('about:')) {
      return
    }

    console.log('Content script initializing for:', location.href)

    // Класс ContentTracker встроенный в этот файл
    class ContentTracker {
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

        this.isInitialized = true;
        console.log(`Content Script started for: ${window.location.href}`);

        // Небольшая задержка для загрузки DOM
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            this.setupTracking()
          })
        } else {
          this.setupTracking()
        }
      }

      private setupTracking() {
        this.sendPageView();
        this.setupEventListeners();
        this.setupIntersectionObserver();
        this.setupSPATracking();
      }

      private sendPageView() {
        this.sendMessage('PAGE_VIEW', {
          url: window.location.href,
          title: document.title,
          referrer: document.referrer || undefined
        }).catch(error => {
          console.warn('Failed to send page view:', error)
        })
      }

      private sendMessage<T = any>(type: string, data?: any): Promise<T> {
        return new Promise((resolve, reject) => {
          const message = {
            type,
            data,
            timestamp: Date.now()
          };

          browser.runtime.sendMessage(message, (response) => {
            if (browser.runtime.lastError) {
              reject(new Error(browser.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      }

      private setupEventListeners() {
        // Visibility change
        document.addEventListener('visibilitychange', () => {
          const visible = document.visibilityState === 'visible';
          if (visible !== this.isVisible) {
            this.isVisible = visible;
            this.sendVisibilityChange(visible, 'visibility_change')
          }
        }, { passive: true })

        // Before unload
        window.addEventListener('beforeunload', () => {
          this.sendVisibilityChange(false, 'before_unload')
        })

        // Window focus/blur
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

        // Page hide/show (для back/forward кеша)
        window.addEventListener('pagehide', () => {
          this.sendVisibilityChange(false, 'page_hide')
        })

        window.addEventListener('pageshow', (event) => {
          this.sendVisibilityChange(true, event.persisted ? 'page_show_cached' : 'page_show')
        })
      }

      private sendVisibilityChange(visible: boolean, reason: string) {
        this.sendMessage('VISIBILITY_CHANGE', {
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

            this.sendMessage('INTERACTION', {
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

    // Создаем и инициализируем трекер
    const tracker = new ContentTracker();
    (window as any).__activityTracker = tracker;
  },
});