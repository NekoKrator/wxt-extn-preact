import { formatBadgeTime, formatFullTime } from "../entrypoints/popup/utils/time";

export class BadgeManager {
  private static instance: BadgeManager;
  private updateInterval?: number;
  private isEnabled = true;
  private currentTabId?: number;
  private tabStartTimes = new Map<number, number>();
  private currentTabTotalTime = 0;
  private currentSessionTime = 0;
  private currentTabUrl?: string;

  static getInstance(): BadgeManager {
    if (!BadgeManager.instance) {
      BadgeManager.instance = new BadgeManager();
    }
    return BadgeManager.instance;
  }

  constructor() {
    this.init();
  }

  private init() {
    this.updateInterval = setInterval(() => {
      this.updateBadge();
    }, 1000);

    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        this.handleTabChange(tabId);
      }
    });
  }

  private handleTabChange(tabId: number) {
    const now = Date.now();

    if (this.currentTabId !== tabId) {
      this.currentTabId = tabId;
      this.tabStartTimes.set(tabId, now);
      this.currentSessionTime = 0;
      this.currentTabTotalTime = 0;
      this.updateBadge();
    }
  }

  private async updateBadge() {
    if (!this.isEnabled || !this.currentTabId) {
      await this.clearBadge();
      return;
    }

    try {
      const startTime = this.tabStartTimes.get(this.currentTabId);
      if (!startTime) {
        await this.clearBadge();
        return;
      }

      const currentTime = Date.now();
      this.currentSessionTime = currentTime - startTime;

      if (this.currentSessionTime < 5000) {
        await this.clearBadge();
        return;
      }

      const totalTimeOnPage = this.currentTabTotalTime + this.currentSessionTime;

      const badgeText = formatBadgeTime(totalTimeOnPage);

      await chrome.action.setBadgeText({
        text: badgeText,
        tabId: this.currentTabId
      });

      await chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50'
      });

      const tab = await chrome.tabs.get(this.currentTabId);
      if (tab) {
        const domain = this.extractDomain(tab.url || '');
        const formattedTotal = formatFullTime(totalTimeOnPage);
        const formattedSession = formatFullTime(this.currentSessionTime);

        await chrome.action.setTitle({
          title: `Activity Analytics\n${domain}\nTotal: ${formattedTotal}\nThis session: ${formattedSession}`,
          tabId: this.currentTabId
        });
      }
    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'Unknown';
    }
  }

  private async clearBadge() {
    try {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'Activity Analytics' });
    } catch (error) {
      console.error('Failed to clear badge:', error);
    }
  }

  public enable() {
    this.isEnabled = true;
    this.updateBadge();
  }

  public disable() {
    this.isEnabled = false;
    this.clearBadge();
  }

  public setEnabled(enabled: boolean) {
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  public resetTabTime(tabId: number) {
    this.tabStartTimes.set(tabId, Date.now());
    this.currentSessionTime = 0;

    if (tabId === this.currentTabId) {
      this.updateBadge();
    }
  }

  public setCurrentTabData(tabId: number, totalTime: number, url: string) {
    if (tabId === this.currentTabId) {
      this.currentTabTotalTime = totalTime;
      this.currentTabUrl = url;
      this.updateBadge();
    }
  }

  public updateCurrentTabTotalTime(totalTime: number) {
    this.currentTabTotalTime = totalTime;
    this.updateBadge();
  }

  public cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    this.clearBadge();
    this.tabStartTimes.clear();
  }
}