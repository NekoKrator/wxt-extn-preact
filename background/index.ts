// src/background/index.ts
import { TabManager } from './tab-manager';
import { SessionManager } from './session-manager';
import { createMessageHandler } from '../shared/utils/messaging';
import { DatabaseService } from '../shared/db/services/database-service';
import { db } from '../shared/db/schema';
import type { TabChangeInfo } from '@/shared/types/browser';

class BackgroundService {
  private tabManager: TabManager;
  private sessionManager: SessionManager;
  private isTrackingEnabled = true;

  constructor() {
    this.tabManager = new TabManager();
    this.sessionManager = SessionManager.getInstance();
    this.init();
  }

  private async init() {
    console.log('Initializing Activity Analytics Extension...');

    try {
      // Инициализируем базу данных
      await db.open();

      // Инициализируем менеджеры
      await this.sessionManager.initialize();
      await this.tabManager.initialize();

      // Настраиваем слушатели событий
      this.setupEventListeners();

      // Настраиваем обработчик сообщений
      this.setupMessageHandler();

      // Настраиваем idle tracking
      browser.idle.setDetectionInterval(30); // 30 секунд

      console.log('Background service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private setupEventListeners() {
    // События вкладок
    browser.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    browser.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    browser.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    // События окон
    browser.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));

    // Idle события
    browser.idle.onStateChanged.addListener(this.handleIdleStateChanged.bind(this));

    // События расширения
    browser.runtime.onSuspend.addListener(this.handleExtensionSuspend.bind(this));
    browser.runtime.onStartup.addListener(this.handleExtensionStartup.bind(this));

    console.log('Event listeners set up');
  }

  private setupMessageHandler() {
    const messageHandler = createMessageHandler({
      // Статистика
      'GET_STATS': this.handleGetStats.bind(this),
      'GET_TODAY_TIME': this.handleGetTodayTime.bind(this),
      'GET_DOMAIN_STATS': this.handleGetDomainStats.bind(this),
      'GET_PAGE_STATS': this.handleGetPageStats.bind(this),

      // Управление
      'PAUSE_TRACKING': this.handlePauseTracking.bind(this),
      'RESUME_TRACKING': this.handleResumeTracking.bind(this),
      'IS_TRACKING_ENABLED': this.handleIsTrackingEnabled.bind(this),

      // Данные
      'EXPORT_DATA': this.handleExportData.bind(this),
      'CLEAR_DATA': this.handleClearData.bind(this),

      // События от content scripts
      'PAGE_VIEW': this.handlePageViewMessage.bind(this),
      'VISIBILITY_CHANGE': this.handleVisibilityChangeMessage.bind(this),
      'INTERACTION': this.handleInteractionMessage.bind(this),

      // Настройки
      'GET_SETTINGS': this.handleGetSettings.bind(this),
      'UPDATE_SETTINGS': this.handleUpdateSettings.bind(this)
    });

    browser.runtime.onMessage.addListener(messageHandler);
    console.log('Message handler set up');
  }

  // ===== ОБРАБОТЧИКИ СОБЫТИЙ CHROME =====

  private async handleTabActivated(activeInfo: Browser.tabs.TabActiveInfo) {
    if (!this.isTrackingEnabled) return;
    await this.tabManager.handleTabFocusGain(activeInfo.tabId);
  }

  private async handleTabUpdated(
    tabId: number,
    changeInfo: TabChangeInfo,
    tab: Browser.tabs.Tab
  ) {
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

  private async handleIdleStateChanged(newState: Browser.idle.IdleState) {
    if (!this.isTrackingEnabled) return;
    await this.tabManager.handleIdleStateChange(newState);
  }

  private async handleExtensionStartup() {
    console.log('Extension startup detected');
    await this.sessionManager.initialize();
    await this.tabManager.initialize();
  }

  private async handleExtensionSuspend() {
    console.log('Extension suspending...');
    await this.tabManager.cleanup();
    await this.sessionManager.handleExtensionSuspend();
  }

  // ===== ОБРАБОТЧИКИ СООБЩЕНИЙ =====

  private async handleGetStats() {
    const topDomains = await DatabaseService.getTopDomains(10);
    const currentTab = this.tabManager.getCurrentTab();
    const sessionStats = await this.sessionManager.getSessionStats(7); // Last 7 days

    return {
      topDomains,
      currentTab: currentTab ? {
        url: currentTab.url,
        domain: currentTab.domain,
        activeTime: await DatabaseService.getCurrentActiveTime(currentTab.pageId)
      } : null,
      sessionStats,
      isTrackingEnabled: this.isTrackingEnabled
    };
  }

  private async handleGetTodayTime() {
    const todayTime = await DatabaseService.getTodayActiveTime();
    return { todayTime };
  }

  private async handleGetDomainStats(message: any) {
    const { domain } = message.data || {};
    if (!domain) {
      throw new Error('Domain is required');
    }

    const stats = await DatabaseService.getDomainStats(domain);
    return stats;
  }

  private async handleGetPageStats(message: any) {
    const { pageId } = message.data || {};
    if (!pageId) {
      throw new Error('Page ID is required');
    }

    const stats = await DatabaseService.getPageDetailedStats(pageId);
    return stats;
  }

  private async handlePauseTracking() {
    this.isTrackingEnabled = false;

    // Завершаем активность всех вкладок
    await this.tabManager.cleanup();

    // Сохраняем настройку
    await this.saveTrackingState();

    console.log('Tracking paused');
    return { success: true };
  }

  private async handleResumeTracking() {
    this.isTrackingEnabled = true;

    // Переинициализируем отслеживание
    await this.tabManager.initialize();

    // Сохраняем настройку
    await this.saveTrackingState();

    console.log('Tracking resumed');
    return { success: true };
  }

  private handleIsTrackingEnabled() {
    return { enabled: this.isTrackingEnabled };
  }

  private async handleExportData() {
    // Экспортируем все данные в JSON формате
    const data = {
      pages: await db.pages.toArray(),
      events: await db.events.toArray(),
      sessions: await db.sessions.toArray(),
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    return data;
  }

  private async handleClearData() {
    await DatabaseService.clearAllData();

    // Переинициализируем после очистки
    await this.sessionManager.startSession();
    await this.tabManager.initialize();

    console.log('All data cleared');
    return { success: true };
  }

  private async handlePageViewMessage(message: any, sender: Browser.runtime.MessageSender) {
    if (!this.isTrackingEnabled || !sender.tab?.id) return;

    const { url, title, referrer } = message.data;
    await this.tabManager.handlePageView(sender.tab.id, url, title);
  }

  private async handleVisibilityChangeMessage(message: any, sender: Browser.runtime.MessageSender) {
    if (!this.isTrackingEnabled || !sender.tab?.id) return;

    const { visible } = message.data;
    await this.tabManager.handleVisibilityChange(sender.tab.id, visible);
  }

  private async handleInteractionMessage(message: any, sender: Browser.runtime.MessageSender) {
    if (!this.isTrackingEnabled || !sender.tab?.id) return;

    // TODO: Реализовать для L2 - обработка взаимодействий
    const { interactionType, details } = message.data;
    console.log('Interaction:', interactionType, details);
  }

  private async handleGetSettings() {
    const settings = await db.settings.toArray();
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, any>);

    return {
      ...settingsMap,
      isTrackingEnabled: this.isTrackingEnabled
    };
  }

  private async handleUpdateSettings(message: any) {
    const { key, value } = message.data;

    await db.settings.put({
      key,
      value,
      updatedAt: Date.now()
    });

    // Применяем некоторые настройки немедленно
    if (key === 'trackingEnabled') {
      if (value) {
        await this.handleResumeTracking();
      } else {
        await this.handlePauseTracking();
      }
    }

    return { success: true };
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  private async saveTrackingState() {
    await db.settings.put({
      key: 'trackingEnabled',
      value: this.isTrackingEnabled,
      updatedAt: Date.now()
    });
  }

  private async loadTrackingState() {
    const setting = await db.settings.where('key').equals('trackingEnabled').first();
    if (setting !== undefined) {
      this.isTrackingEnabled = setting.value;
    }
  }
}

// Инициализация background service
new BackgroundService();