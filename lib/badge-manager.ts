export class BadgeManager {
  private static instance: BadgeManager;
  private updateInterval?: number;
  private isEnabled = true;
  private currentTabId?: number;
  private tabStartTimes = new Map<number, number>();

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
    }, 5000);

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
      const timeSpent = currentTime - startTime;

      if (timeSpent < 10000) {
        await this.clearBadge();
        return;
      }

      const badgeText = this.formatBadgeTime(timeSpent);

      await chrome.action.setBadgeText({
        text: badgeText,
        tabId: this.currentTabId
      });

      await chrome.action.setBadgeBackgroundColor({
        color: '#dfdfdf'
      });

      const tab = await chrome.tabs.get(this.currentTabId);
      if (tab) {
        const domain = this.extractDomain(tab.url || '');
        const formattedTime = this.formatFullTime(timeSpent);

        await chrome.action.setTitle({
          title: `Activity Analytics\n${domain}: ${formattedTime}`,
          tabId: this.currentTabId
        });
      }

    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  private formatBadgeTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  private formatFullTime(ms: number): string {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(' ');
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
    if (tabId === this.currentTabId) {
      this.updateBadge();
    }
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