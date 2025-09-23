import { CONST_EVENTS } from "../shared/constants/constants";

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    if (location.protocol.startsWith('chrome') ||
      location.protocol.startsWith('moz-extension') ||
      location.href.includes('chrome://') ||
      location.href.includes('about:')) {
      return;
    }

    console.log('Content script initializing for:', location.href)

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
        this.sendMessage(CONST_EVENTS.PAGE_VIEW, {
          url: window.location.href,
          title: document.title,
          referrer: document.referrer || undefined
        }).catch(error => {
          console.warn('Failed to send page view:', error)
        })
      }

      private async sendMessage<T = any>(type: string, data?: any): Promise<T> {
        try {
          const message = {
            type,
            data,
            timestamp: Date.now()
          };

          const response = await browser.runtime.sendMessage(message);
          return response;
        } catch (error) {
          throw new Error(`Failed to send message: ${error}`);
        }
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
        this.sendMessage(CONST_EVENTS.VISIBILITY_CHANGE, {
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

        history.pushState = function (data: any, unused: string, url?: string | URL | null) {
          originalPushState.call(this, data, unused, url);
          setTimeout(checkUrlChange, 0);
        }

        history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
          originalReplaceState.call(this, data, unused, url);
          setTimeout(checkUrlChange, 0);
        }

        const spaEvents = ['routechange', 'navigationend', 'urlchange'] as const;
        spaEvents.forEach((eventName: string) => {
          window.addEventListener(eventName, checkUrlChange, { passive: true })
        })

        // L2
        function debounce(func, delay) {
          let timeout;

          return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
          };
        }

        function throttle(func, delay) {
          let last = 0;

          return (...args) => {
            const now = Date.now();

            if (now - last >= delay) {
              func(...args);
              last = now;
            }
          };
        }

        document.addEventListener('scroll', debounce(() => {
          const doc = document.documentElement
          const percent = Math.round(
            (doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100
          )

          this.sendMessage('scroll_depth', {
            type: 'scroll_depth',
            value: percent
          }).catch(error => {
            console.warn('Failed to send scroll_depth', error)
          })
        }, 300))

        document.addEventListener('click', throttle((event) => {
          this.sendMessage('click', {
            type: 'click',
            tag: event.target.tagName,
            id: event.target.id,
            classes: event.target.className,
            x: event.clientX,
            y: event.clientY
          })
        }, 300))


        document.addEventListener('keydown', () => {
          this.sendMessage('keydown', {
            type: 'keydown'
          }).catch(error => {
            console.warn('Failed to send keydown:', error)
          })
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

    // const tracker = new ContentTracker();

    // (globalThis as any).__activityTracker = tracker;

    // window.addEventListener('beforeunload', () => {
    //   tracker.cleanup();
    // });

    const tracker = new ContentTracker();
    (window as any).__activityTracker = tracker;
  },
});