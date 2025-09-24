import { BadgeManager } from './badge-manager';
import { IdleTracker } from './idle-tracker';
import { SessionManager } from './session-manager';
import { DatabaseService } from './database-service';
import { CONST_EVENTS } from '../../shared/constants/constants';

interface ActiveTab {
  tabId: number;
  pageId: number;
  url: string;
  domain: string;
  isVisible: boolean;
  isIdle: boolean;
  lastActivityTime: number;
}

export class TabManager {
  private activeTabs = new Map<number, ActiveTab>();
  private currentFocusedTab?: number;
  private sessionManager: SessionManager;
  private badgeManager: BadgeManager;
  private idleTracker: IdleTracker;
  private databaseService: DatabaseService;

  constructor(sessionManager: SessionManager, badgeManager: BadgeManager, databaseService: DatabaseService) {
    this.sessionManager = sessionManager;
    this.badgeManager = badgeManager;
    this.databaseService = databaseService;
    this.idleTracker = new IdleTracker(15);

    this.idleTracker.onIdleChange(this.handleIdleChange.bind(this));
  }

  private handleIdleChange(isIdle: boolean) {
    console.log(`Tab Manager: Idle state changed to ${isIdle ? 'idle' : 'active'}`);

    if (isIdle) {
      if (this.currentFocusedTab) {
        this.endTabActivity(this.currentFocusedTab);
      }
    } else {
      if (this.currentFocusedTab) {
        this.startTabActivity(this.currentFocusedTab);
        this.badgeManager.resetTabTime(this.currentFocusedTab);
      }
    }

    this.activeTabs.forEach(tab => {
      tab.isIdle = isIdle;
    });
  }

  async handlePageView(tabId: number, url: string, title: string) {
    await this.endTabActivity(tabId);

    const page = await this.databaseService.upsertPage(url, title);

    await this.databaseService.addEvent(
      page.id!,
      this.sessionManager.getCurrentSessionId(),
      CONST_EVENTS.PAGE_VIEW,
      { referrer: await this.getTabReferrer(tabId) }
    );

    this.activeTabs.set(tabId, {
      tabId,
      pageId: page.id!,
      url: page.url,
      domain: page.domain,
      isVisible: this.currentFocusedTab === tabId,
      isIdle: this.idleTracker.getIdleState(),
      lastActivityTime: Date.now()
    });

    console.log(`Page view: ${page.url} (tab ${tabId})`);

    this.badgeManager.resetTabTime(tabId);

    const totalTime = await this.databaseService.getTabTotalTime(page.url) || 0;
    this.badgeManager.setCurrentTabData(tabId, totalTime, page.url);

    if (this.currentFocusedTab === tabId && !this.idleTracker.getIdleState()) {
      await this.startTabActivity(tabId);
    }
  }

  async handleTabFocusGain(tabId: number) {
    if (this.currentFocusedTab && this.currentFocusedTab !== tabId) {
      await this.endTabActivity(this.currentFocusedTab);
    }

    this.currentFocusedTab = tabId;

    const tab = this.activeTabs.get(tabId);
    if (tab) {
      tab.isVisible = true;
      tab.lastActivityTime = Date.now();

      await this.databaseService.addEvent(
        tab.pageId,
        this.sessionManager.getCurrentSessionId(),
        CONST_EVENTS.FOCUS_GAIN
      );

      this.badgeManager.resetTabTime(tabId);

      const totalTime = await this.databaseService.getTabTotalTime(tab.url) || 0;
      this.badgeManager.setCurrentTabData(tabId, totalTime, tab.url);

      if (!this.idleTracker.getIdleState()) {
        await this.startTabActivity(tabId);
      }
    }
  }

  async saveCurrentActivity(tabId: number) {
    const tab = this.activeTabs.get(tabId);
    if (!tab) return;

    const savedTime = await this.endTabActivity(tabId);
    if (savedTime && savedTime > 0) {
      const newTotalTime = await this.databaseService.getTabTotalTime(tab.url) || 0;
      this.badgeManager.updateCurrentTabTotalTime(newTotalTime);

      await this.startTabActivity(tabId);
    }
  }

  async handleTabClose(tabId: number) {
    const tab = this.activeTabs.get(tabId);
    if (tab) {
      await this.endTabActivity(tabId);
      await this.databaseService.addEvent(
        tab.pageId,
        this.sessionManager.getCurrentSessionId(),
        CONST_EVENTS.TAB_CLOSE
      );
    }

    this.activeTabs.delete(tabId);
    if (this.currentFocusedTab === tabId) {
      this.currentFocusedTab = undefined;
    }
  }

  async handleWindowFocusChanged(windowId: number) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      if (this.currentFocusedTab) {
        await this.endTabActivity(this.currentFocusedTab);
        this.currentFocusedTab = undefined;
      }
    } else {
      try {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        if (tabs[0]?.id) {
          await this.handleTabFocusGain(tabs[0].id);
        }
      } catch (error) {
        console.error(`Error handling window focus: ${error}`);
      }
    }
  }

  async handleVisibilityChange(tabId: number, visible: boolean) {
    const tab = this.activeTabs.get(tabId);
    if (!tab) return;

    if (visible && !tab.isVisible) {
      await this.handleTabFocusGain(tabId);
    } else if (!visible && tab.isVisible) {
      await this.endTabActivity(tabId);
      tab.isVisible = false;
    }
  }

  private async startTabActivity(tabId: number) {
    const tab = this.activeTabs.get(tabId);
    if (!tab) return;

    if (tab.isVisible && !this.idleTracker.getIdleState() && this.currentFocusedTab === tabId) {
      await this.databaseService.startPageActivity(tab.pageId);
      tab.lastActivityTime = Date.now();
      console.log(`Started activity tracking for tab ${tabId}: ${tab.url}`);
    }
  }

  private async endTabActivity(tabId: number): Promise<number | undefined> {
    const tab = this.activeTabs.get(tabId);
    if (!tab) return undefined;

    const activeTime = await this.databaseService.endPageActivity(tab.pageId);
    if (activeTime && activeTime > 0) {
      console.log(`Ended activity tracking for tab ${tabId}: ${tab.url}, time: ${activeTime}ms`);
    }

    return activeTime;
  }

  private async getTabReferrer(tabId: number): Promise<string | undefined> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.pendingUrl || tab.url;
    } catch {
      return undefined;
    }
  }

  getCurrentTab() {
    if (this.currentFocusedTab === undefined) {
      return undefined;
    }
    return this.activeTabs.get(this.currentFocusedTab);
  }

  async initialize() {
    try {
      const tabs = await chrome.tabs.query({});

      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          const page = await this.databaseService.upsertPage(tab.url, tab.title || '');

          this.activeTabs.set(tab.id, {
            tabId: tab.id,
            pageId: page.id!,
            url: page.url,
            domain: page.domain,
            isVisible: tab.active,
            isIdle: this.idleTracker.getIdleState(),
            lastActivityTime: Date.now()
          });

          if (tab.active) {
            try {
              const window = await chrome.windows.get(tab.windowId);
              if (window.focused) {
                this.currentFocusedTab = tab.id;
                await this.startTabActivity(tab.id);
                this.badgeManager.resetTabTime(tab.id);
              }
            } catch (error) {
              console.warn(`Could not get window info for tab ${tab.id}:`, error);
            }
          }
        }
      }

      console.log(`Initialized tab manager with ${this.activeTabs.size} tabs`);
    } catch (error) {
      console.error(`Error initializing tab manager: ${error}`);
    }
  }

  async cleanup() {
    for (const tabId of this.activeTabs.keys()) {
      await this.endTabActivity(tabId);
    }
    this.activeTabs.clear();
    this.currentFocusedTab = undefined;
    this.idleTracker.cleanup();
  }
}