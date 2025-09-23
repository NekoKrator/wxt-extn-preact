import { Dexie } from 'dexie';
import { BadgeManager } from '../lib/badge-manager';
import { IdleTracker } from '../lib/idle-tracker'
import { CONST_EVENTS } from '../lib/constants';

export default defineBackground(() => {
  console.log('Background script starting...');

  interface ActiveTab {
    tabId: number
    pageId: number
    url: string
    domain: string
    isVisible: boolean
    isIdle: boolean
    lastActivityTime: number
  }

  interface BaseMessage {
    type: string
    data?: any
    timestamp?: number
  }

  function cleanUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
    } catch {
      return url
    }
  }

  function extractDomain(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return 'unknown'
    }
  }

  import('dexie').then(({ default: Dexie }) => {
    class AnalyticsDB extends Dexie {
      pages!: Dexie.Table<any, number>
      events!: Dexie.Table<any, number>
      sessions!: Dexie.Table<any, number>
      settings!: Dexie.Table<any, number>

      constructor() {
        super('AnalyticsDB')
        this.version(1).stores({
          pages: '++id, url, domain, firstVisit, lastVisit, totalActiveTime',
          events: '++id, pageId, sessionId, timestamp, type',
          sessions: '++id, sessionId, startTime, endTime, isActive',
          settings: '++id, key'
        })
      }
    }

    const db = new AnalyticsDB()

    class SessionManager {
      private static instance: SessionManager
      private currentSessionId: string | null = null
      private sessionStartTime: number | null = null

      static getInstance(): SessionManager {
        if (!SessionManager.instance) {
          SessionManager.instance = new SessionManager()
        }
        return SessionManager.instance
      }

      getCurrentSessionId(): string {
        if (!this.currentSessionId) {
          this.startSession();
        }
        return this.currentSessionId!;
      }

      async startSession(): Promise<string> {
        if (this.currentSessionId) {
          await this.endSession()
        }

        this.currentSessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        this.sessionStartTime = Date.now()

        await db.sessions.add({
          sessionId: this.currentSessionId,
          startTime: this.sessionStartTime,
          isActive: true
        })

        console.log(`Started new session: ${this.currentSessionId}`)
        return this.currentSessionId
      }

      async endSession() {
        if (!this.currentSessionId) return

        const endTime = Date.now()
        await db.sessions.where('sessionId').equals(this.currentSessionId).modify({
          endTime,
          isActive: false
        })

        console.log(`Ended session ${this.currentSessionId}`)
        this.currentSessionId = null
        this.sessionStartTime = null
      }

      async initialize() {
        const activeSessions = await db.sessions.where('isActive').equals(1).toArray()
        if (activeSessions.length > 0) {
          console.log(`Found ${activeSessions.length} unclosed sessions, closing them`)
          const endTime = Date.now()
          await Promise.all(
            activeSessions.map(session =>
              db.sessions.update(session.id!, {
                endTime,
                isActive: false
              })
            )
          )
        }
        await this.startSession()
      }
    }

    class DatabaseService {
      static async upsertPage(url: string, title: string) {
        const cleanedUrl = cleanUrl(url);
        const domain = extractDomain(cleanedUrl);

        const existingPage = await db.pages
          .where('url')
          .equals(cleanedUrl)
          .first();

        if (existingPage) {
          const updatedPage = {
            ...existingPage,
            title,
            lastVisit: Date.now(),
            visitCount: existingPage.visitCount + 1
          };

          await db.pages.update(existingPage.id!, {
            title: updatedPage.title,
            lastVisit: updatedPage.lastVisit,
            visitCount: updatedPage.visitCount
          });

          return updatedPage;
        }

        const now = Date.now();
        const newPage = {
          url: cleanedUrl,
          domain,
          title,
          firstVisit: now,
          lastVisit: now,
          totalActiveTime: 0,
          visitCount: 1
        };

        const pageId = await db.pages.add(newPage);
        return { ...newPage, id: pageId };
      }

      static async addEvent(pageId: number, sessionId: string, type: string, data?: any) {
        await db.events.add({
          pageId,
          sessionId,
          timestamp: Date.now(),
          type,
          data
        });
      }

      static async startPageActivity(pageId: number) {
        const page = await db.pages.get(pageId);
        if (!page || page.currentSessionStart) return;

        await db.pages.update(pageId, {
          currentSessionStart: Date.now(),
          lastVisit: Date.now()
        });
      }

      static async endPageActivity(pageId: number): Promise<number> {
        const page = await db.pages.get(pageId);
        if (!page?.currentSessionStart) return 0;

        const now = Date.now();
        const sessionTime = now - page.currentSessionStart;

        await db.pages.update(pageId, {
          totalActiveTime: page.totalActiveTime + sessionTime,
          currentSessionStart: undefined,
          lastVisit: now
        });

        return sessionTime;
      }

      static async getTodayActiveTime(): Promise<number> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const pages = await db.pages.toArray();
        return pages.reduce((total, page) => {
          const currentSession = page.currentSessionStart && page.currentSessionStart >= startOfDay.getTime()
            ? Date.now() - page.currentSessionStart
            : 0;
          return total + page.totalActiveTime + currentSession;
        }, 0);
      }

      static async getTopDomains(limit = 10) {
        const pages = await db.pages.toArray();
        const domainMap = new Map();

        pages.forEach(page => {
          const totalTime = page.totalActiveTime;

          const existing = domainMap.get(page.domain) || {
            totalTime: 0,
            pageCount: 0,
            visitCount: 0
          };

          domainMap.set(page.domain, {
            totalTime: existing.totalTime + totalTime,
            pageCount: existing.pageCount + 1,
            visitCount: existing.visitCount + page.visitCount
          });
        });

        return Array.from(domainMap.entries())
          .map(([domain, stats]) => ({ domain, ...stats }))
          .sort((a, b) => b.totalTime - a.totalTime)
          .slice(0, limit);
      }

      static async clearAllData() {
        await db.transaction('rw', [db.pages, db.events, db.sessions], async () => {
          await db.pages.clear();
          await db.events.clear();
          await db.sessions.clear();
        });
      }
    }

    class TabManager {
      private activeTabs = new Map<number, ActiveTab>()
      private currentFocusedTab?: number
      private sessionManager: SessionManager
      private badgeManager: BadgeManager
      private idleTracker: IdleTracker

      constructor() {
        this.sessionManager = SessionManager.getInstance()
        this.badgeManager = BadgeManager.getInstance()
        this.idleTracker = new IdleTracker(15)

        this.idleTracker.onIdleChange(this.handleIdleChange.bind(this))
      }

      private handleIdleChange(isIdle: boolean) {
        console.log(`Tab Manager: Idle state changed to ${isIdle ? 'idle' : 'active'}`)

        if (isIdle) {
          if (this.currentFocusedTab) {
            this.endTabActivity(this.currentFocusedTab)
          }
        } else {
          if (this.currentFocusedTab) {
            this.startTabActivity(this.currentFocusedTab)
            this.badgeManager.resetTabTime(this.currentFocusedTab)
          }
        }

        this.activeTabs.forEach(tab => {
          tab.isIdle = isIdle
        })
      }

      async handlePageView(tabId: number, url: string, title: string) {
        await this.endTabActivity(tabId)

        const page = await DatabaseService.upsertPage(url, title)

        await DatabaseService.addEvent(
          page.id!,
          this.sessionManager.getCurrentSessionId(),
          CONST_EVENTS.PAGE_VIEW,
          { referrer: await this.getTabReferrer(tabId) }
        )

        this.activeTabs.set(tabId, {
          tabId,
          pageId: page.id!,
          url: page.url,
          domain: page.domain,
          isVisible: this.currentFocusedTab === tabId,
          isIdle: this.idleTracker.getIdleState(),
          lastActivityTime: Date.now()
        })

        console.log(`Page view: ${page.url} (tab ${tabId})`)

        this.badgeManager.resetTabTime(tabId)

        if (this.currentFocusedTab === tabId && !this.idleTracker.getIdleState()) {
          await this.startTabActivity(tabId)
        }
      }

      async handleTabFocusGain(tabId: number) {
        if (this.currentFocusedTab && this.currentFocusedTab !== tabId) {
          await this.endTabActivity(this.currentFocusedTab)
        }

        this.currentFocusedTab = tabId

        const tab = this.activeTabs.get(tabId)
        if (tab) {
          tab.isVisible = true
          tab.lastActivityTime = Date.now()

          await DatabaseService.addEvent(
            tab.pageId,
            this.sessionManager.getCurrentSessionId(),
            CONST_EVENTS.FOCUS_GAIN
          )

          this.badgeManager.resetTabTime(tabId)

          if (!this.idleTracker.getIdleState()) {
            await this.startTabActivity(tabId)
          }
        }
      }

      async handleTabClose(tabId: number) {
        const tab = this.activeTabs.get(tabId)
        if (tab) {
          await this.endTabActivity(tabId)
          await DatabaseService.addEvent(
            tab.pageId,
            this.sessionManager.getCurrentSessionId(),
            CONST_EVENTS.TAB_CLOSE
          )
        }

        this.activeTabs.delete(tabId)
        if (this.currentFocusedTab === tabId) {
          this.currentFocusedTab = undefined
        }
      }

      async handleWindowFocusChanged(windowId: number) {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
          if (this.currentFocusedTab) {
            await this.endTabActivity(this.currentFocusedTab)
            this.currentFocusedTab = undefined
          }
        } else {
          try {
            const tabs = await chrome.tabs.query({ active: true, windowId })
            if (tabs[0]?.id) {
              await this.handleTabFocusGain(tabs[0].id)
            }
          } catch (error) {
            console.error(`Error handling window focus: ${error}`)
          }
        }
      }

      async handleVisibilityChange(tabId: number, visible: boolean) {
        const tab = this.activeTabs.get(tabId)
        if (!tab) return

        if (visible && !tab.isVisible) {
          await this.handleTabFocusGain(tabId)
        } else if (!visible && tab.isVisible) {
          await this.endTabActivity(tabId)
          tab.isVisible = false
        }
      }

      private async startTabActivity(tabId: number) {
        const tab = this.activeTabs.get(tabId)
        if (!tab) return

        if (tab.isVisible && !this.idleTracker.getIdleState() && this.currentFocusedTab === tabId) {
          await DatabaseService.startPageActivity(tab.pageId)
          tab.lastActivityTime = Date.now()
          console.log(`Started activity tracking for tab ${tabId}: ${tab.url}`)
        }
      }

      private async endTabActivity(tabId: number): Promise<number | undefined> {
        const tab = this.activeTabs.get(tabId)
        if (!tab) return undefined

        const activeTime = await DatabaseService.endPageActivity(tab.pageId)
        if (activeTime && activeTime > 0) {
          console.log(`Ended activity tracking for tab ${tabId}: ${tab.url}, time: ${activeTime}ms`)
        }

        return activeTime
      }

      private async getTabReferrer(tabId: number): Promise<string | undefined> {
        try {
          const tab = await chrome.tabs.get(tabId)
          return tab.pendingUrl || tab.url
        } catch {
          return undefined
        }
      }

      getCurrentTab() {
        if (this.currentFocusedTab === undefined) {
          return undefined
        }
        return this.activeTabs.get(this.currentFocusedTab)
      }

      async initialize() {
        try {
          const tabs = await chrome.tabs.query({})

          for (const tab of tabs) {
            if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
              const page = await DatabaseService.upsertPage(tab.url, tab.title || '')

              this.activeTabs.set(tab.id, {
                tabId: tab.id,
                pageId: page.id!,
                url: page.url,
                domain: page.domain,
                isVisible: tab.active,
                isIdle: this.idleTracker.getIdleState(),
                lastActivityTime: Date.now()
              })

              if (tab.active) {
                try {
                  const window = await chrome.windows.get(tab.windowId)
                  if (window.focused) {
                    this.currentFocusedTab = tab.id
                    await this.startTabActivity(tab.id)
                    this.badgeManager.resetTabTime(tab.id)
                  }
                } catch (error) {
                  console.warn(`Could not get window info for tab ${tab.id}:`, error)
                }
              }
            }
          }

          console.log(`Initialized tab manager with ${this.activeTabs.size} tabs`)
        } catch (error) {
          console.error(`Error initializing tab manager: ${error}`)
        }
      }

      async cleanup() {
        for (const tabId of this.activeTabs.keys()) {
          await this.endTabActivity(tabId)
        }
        this.activeTabs.clear()
        this.currentFocusedTab = undefined
        this.idleTracker.cleanup()
      }

      async saveCurrentActivity(tabId: number) {
        const tab = this.activeTabs.get(tabId);
        if (!tab) return;

        const savedTime = await this.endTabActivity(tabId);
        if (savedTime && savedTime > 0) {
          await this.startTabActivity(tabId);
        }
      }
    }

    class BackgroundService {
      private tabManager: TabManager;
      private sessionManager: SessionManager;
      private badgeManager: BadgeManager;
      private isTrackingEnabled = true;

      constructor() {
        this.tabManager = new TabManager();
        this.sessionManager = SessionManager.getInstance();
        this.badgeManager = BadgeManager.getInstance();
        this.init();
      }

      private async init() {
        console.log('Initializing Activity Analytics Extension...');

        try {
          await db.open();
          await this.sessionManager.initialize();
          await this.tabManager.initialize();

          this.setupEventListeners();
          this.setupMessageHandler();

          const settings = await chrome.storage.sync.get(['badgeEnabled']);
          this.badgeManager.setEnabled(settings.badgeEnabled !== false);

          setInterval(() => {
            this.saveCurrentSessions();
          }, 30000);

          console.log('Background service initialized successfully');
        } catch (error) {
          console.error('Failed to initialize background service:', error);
        }
      }

      private async saveCurrentSessions() {
        if (!this.isTrackingEnabled) return;

        try {
          const currentTab = this.tabManager.getCurrentTab();
          if (currentTab) {
            await this.tabManager.saveCurrentActivity(currentTab.tabId);
          }
        } catch (error) {
          console.error('Failed to save current sessions:', error);
        }
      }

      private setupEventListeners() {
        chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
        chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
        chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
        chrome.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));
      }

      private setupMessageHandler() {
        chrome.runtime.onMessage.addListener((message: BaseMessage, sender, sendResponse) => {
          this.handleMessage(message, sender)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => {
              console.error(`Error handling message ${message.type}:`, error);
              sendResponse({ success: false, error: error.message });
            });
          return true;
        });
      }

      private async handleMessage(message: BaseMessage, sender: chrome.runtime.MessageSender) {
        if (!this.isTrackingEnabled && !['IS_TRACKING_ENABLED', 'RESUME_TRACKING'].includes(message.type)) {
          return null;
        }

        switch (message.type) {
          case CONST_EVENTS.GET_TODAY_TIME:
            const todayTime = await DatabaseService.getTodayActiveTime();
            return { todayTime };

          case CONST_EVENTS.GET_STATS:
            const topDomains = await DatabaseService.getTopDomains(10);
            const currentTab = this.tabManager.getCurrentTab();
            return {
              topDomains,
              currentTab: currentTab ? {
                url: currentTab.url,
                domain: currentTab.domain,
                activeTime: 0 // TODO: calculate current active time
              } : null
            };

          case CONST_EVENTS.IS_TRACKING_ENABLED:
            return { enabled: this.isTrackingEnabled };

          case CONST_EVENTS.PAUSE_TRACKING:
            this.isTrackingEnabled = false;
            this.badgeManager.disable();
            await this.tabManager.cleanup();
            return { success: true };

          case CONST_EVENTS.RESUME_TRACKING:
            this.isTrackingEnabled = true;
            this.badgeManager.enable();
            await this.tabManager.initialize();
            return { success: true };

          case CONST_EVENTS.SET_BADGE_ENABLED:
            const { enabled } = message.data;
            this.badgeManager.setEnabled(enabled);
            await chrome.storage.sync.set({ badgeEnabled: enabled });
            return { success: true };

          case CONST_EVENTS.EXPORT_DATA:
            const data = {
              pages: await db.pages.toArray(),
              events: await db.events.toArray(),
              sessions: await db.sessions.toArray(),
              exportDate: new Date().toISOString(),
              version: '1.0'
            };
            return data;

          case CONST_EVENTS.CLEAR_DATA:
            await DatabaseService.clearAllData();
            await this.sessionManager.initialize();
            await this.tabManager.initialize();
            return { success: true };

          case CONST_EVENTS.PAGE_VIEW:
            if (sender.tab?.id) {
              const { url, title } = message.data;
              await this.tabManager.handlePageView(sender.tab.id, url, title);
            }
            return null;

          case CONST_EVENTS.VISIBILITY_CHANGE:
            if (sender.tab?.id) {
              const { visible } = message.data;
              await this.tabManager.handleVisibilityChange(sender.tab.id, visible);
            }
            return null

          // L2
          case 'scroll_depth':
            console.log(message.data)
            return null

          case 'click':
            console.log({ ...message })
            return null

          case 'keydown':
            console.log('pressed')
            return null

          default:
            console.error(`Unknown message type: ${message.type}`);
            return null;
        }
      }

      private async handleTabActivated(activeInfo: { tabId: number }) {
        if (!this.isTrackingEnabled) return;
        await this.tabManager.handleTabFocusGain(activeInfo.tabId);
      }

      private async handleTabUpdated(tabId: number, changeInfo: any, tab: any) {
        if (!this.isTrackingEnabled) return;
        if (changeInfo.status === 'complete' && tab.url) {
          await this.tabManager.handlePageView(tabId, tab.url, tab.title || '');
        }
      }

      private async handleTabRemoved(tabId: number) {
        await this.tabManager.handleTabClose(tabId);
      }

      private async handleWindowFocusChanged(windowId: number) {
        if (!this.isTrackingEnabled) return;
        await this.tabManager.handleWindowFocusChanged(windowId);
      }
    }

    new BackgroundService();
  });
})