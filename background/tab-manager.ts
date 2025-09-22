import { DatabaseService } from "@/shared/db/services/database-service";
import { SessionManager } from "./session-manager";
import type { ActiveTab } from "@/shared/types/browser";

/**
 * @class TabManager
 * keeps track of browser tabs and what user is doing on them
 */
export class TabManager {
  private activeTabs = new Map<number, ActiveTab>()
  private currentFocusedTab?: number
  private sessionManager: SessionManager
  private isIdle = false

  constructor() {
    this.sessionManager = SessionManager.getInstance()
  }

  /**
   * registers that a page has been opened or changed in a tab
   */
  async handlePageView(tabId: number, url: string, title: string) {
    // Завершаем предыдущую активность этой вкладки
    await this.endTabActivity(tabId)

    // Создаем/обновляем страницу в БД
    const page = await DatabaseService.upsertPage(url, title)

    // Добавляем событие page_view
    await DatabaseService.addEvent(
      page.id!,
      this.sessionManager.getCurrentSessionId(),
      'page_view',
      { referrer: await this.getTabReferrer(tabId) }
    )

    // Обновляем информацию о вкладке
    this.activeTabs.set(tabId, {
      tabId,
      pageId: page.id!,
      url: page.url,
      domain: page.domain,
      isVisible: this.currentFocusedTab === tabId,
      isIdle: this.isIdle,
      lastActivityTime: Date.now()
    })

    console.log(`Page view: ${page.url} (tab ${tabId})`)

    // Если вкладка активна и пользователь не idle - начинаем отслеживание
    if (this.currentFocusedTab === tabId && !this.isIdle) {
      await this.startTabActivity(tabId)
    }
  }

  /**
   * marks a tab as now being focused by the user
   */
  async handleTabFocusGain(tabId: number) {
    // Завершаем активность предыдущей вкладки
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
        'focus_gain'
      )

      console.log(`Tab gained focus: ${tab.url} (tab ${tabId})`)

      // Начинаем отслеживание активности если не idle
      if (!this.isIdle) {
        await this.startTabActivity(tabId)
      }
    }
  }

  /**
   * marks a tab as no longer being focused by the user
   */
  async handleTabFocusLost(tabId: number) {
    const tab = this.activeTabs.get(tabId)
    if (tab) {
      tab.isVisible = false
      const activeTime = await this.endTabActivity(tabId)

      await DatabaseService.addEvent(
        tab.pageId,
        this.sessionManager.getCurrentSessionId(),
        'focus_lost',
        { activeTimeMs: activeTime }
      )

      console.log(`Tab lost focus: ${tab.url} (tab ${tabId})`)
    }
  }

  /**
   * handles what happens when a tab is closed
   */
  async handleTabClose(tabId: number) {
    const tab = this.activeTabs.get(tabId)
    if (tab) {
      await this.endTabActivity(tabId)

      await DatabaseService.addEvent(
        tab.pageId,
        this.sessionManager.getCurrentSessionId(),
        'tab_close'
      )

      console.log(`Tab closed: ${tab.url} (tab ${tabId})`)
    }

    this.activeTabs.delete(tabId)
    if (this.currentFocusedTab === tabId) {
      this.currentFocusedTab = undefined
    }
  }

  /**
   * handles when the browser window gains or loses focus
   */
  async handleWindowFocusChanged(windowId: number) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      // Окно потеряло фокус
      if (this.currentFocusedTab) {
        await this.handleTabFocusLost(this.currentFocusedTab)
        this.currentFocusedTab = undefined
      }
    } else {
      // Окно получило фокус
      try {
        const tabs = await browser.tabs.query({ active: true, windowId })
        if (tabs[0]?.id) {
          await this.handleTabFocusGain(tabs[0].id)
        }
      } catch (error) {
        console.error(`Error handling window focus: ${error}`)
      }
    }
  }

  /**
   * handles visibility changes from content scripts
   */
  async handleVisibilityChange(tabId: number, visible: boolean) {
    const tab = this.activeTabs.get(tabId)
    if (!tab) return

    if (visible && !tab.isVisible) {
      await this.handleTabFocusGain(tabId)
    } else if (!visible && tab.isVisible) {
      await this.handleTabFocusLost(tabId)
    }
  }

  /**
   * handles idle state changes
   */
  async handleIdleStateChange(newState: Browser.idle.IdleState) {
    const wasIdle = this.isIdle
    this.isIdle = newState !== 'active'

    console.log(`Idle state changed: ${newState}`)

    if (!wasIdle && this.isIdle) {
      // Стали idle - прекращаем отслеживание
      if (this.currentFocusedTab) {
        await this.endTabActivity(this.currentFocusedTab)
      }
    } else if (wasIdle && !this.isIdle) {
      // Перестали быть idle - возобновляем отслеживание
      if (this.currentFocusedTab) {
        await this.startTabActivity(this.currentFocusedTab)
      }
    }

    // Обновляем состояние idle для всех активных вкладок
    this.activeTabs.forEach(tab => {
      tab.isIdle = this.isIdle
    })
  }

  /**
   * start tracking activity for a tab
   */
  private async startTabActivity(tabId: number) {
    const tab = this.activeTabs.get(tabId)
    if (!tab) return

    // Начинаем отслеживание только если вкладка видима и не idle
    if (tab.isVisible && !this.isIdle && this.currentFocusedTab === tabId) {
      await DatabaseService.startPageActivity(tab.pageId)
      tab.lastActivityTime = Date.now()
      console.log(`Started activity tracking for tab ${tabId}: ${tab.url}`)
    }
  }

  /**
   * stops tracking activity for a tab
   */
  private async endTabActivity(tabId: number): Promise<number | undefined> {
    const tab = this.activeTabs.get(tabId)
    if (!tab) return undefined

    const activeTime = await DatabaseService.endPageActivity(tab.pageId)
    if (activeTime && activeTime > 0) {
      console.log(`Ended activity tracking for tab ${tabId}: ${tab.url}, time: ${activeTime}ms`)
    }

    return activeTime
  }

  /**
   * gets the referrer URL for a tab
   */
  private async getTabReferrer(tabId: number): Promise<string | undefined> {
    try {
      const tab = await browser.tabs.get(tabId)
      return tab.pendingUrl || tab.url
    } catch {
      return undefined
    }
  }

  /**
   * return a copy of all currently active tabs being tracked
   */
  getActiveTabs(): Map<number, ActiveTab> {
    return new Map(this.activeTabs)
  }

  /**
   * returns info about the tab the user is currently looking at
   */
  getCurrentTab(): ActiveTab | undefined {
    if (this.currentFocusedTab === undefined) {
      return undefined
    }
    return this.activeTabs.get(this.currentFocusedTab)
  }

  /**
   * sets up the TabManager when the extension starts
   */
  async initialize() {
    try {
      const tabs = await browser.tabs.query({})

      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          const page = await DatabaseService.upsertPage(tab.url, tab.title || '')

          this.activeTabs.set(tab.id, {
            tabId: tab.id,
            pageId: page.id!,
            url: page.url,
            domain: page.domain,
            isVisible: tab.active,
            isIdle: false,
            lastActivityTime: Date.now()
          })

          if (tab.active) {
            try {
              const window = await browser.windows.get(tab.windowId)
              if (window.focused) {
                this.currentFocusedTab = tab.id
                await this.startTabActivity(tab.id)
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

  /**
   * cleanup all tab activities and clear state
   */
  async cleanup() {
    for (const tabId of this.activeTabs.keys()) {
      await this.endTabActivity(tabId)
    }

    this.activeTabs.clear()
    this.currentFocusedTab = undefined
    console.log('TabManager cleaned up')
  }
}