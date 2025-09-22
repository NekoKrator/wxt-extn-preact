export async function handleTabActivated(tabId: number) {

}

export async function handleTabRemoved(tabId: number) {

}

import { saveEvent, upsertPage, db } from '@/lib/storage'
import { formatTime } from '@/lib/utils'
import { browser } from 'wxt/browser'

export default defineBackground(() => {
  let activeTabId: number | null = null
  let activeStart: number | null = null
  let userActive = true
  let collectionEnabled = true

  const activeStartTimes = new Map<number, number>()

  browser.idle.setDetectionInterval(15)

  browser.runtime.onInstalled.addListener(() => {
    console.log('Installed')
  })

  async function updateCollectionEnabled() {
    const result = await browser.storage.sync.get(['collectionEnabled'])
    collectionEnabled = result.collectionEnabled ?? true

    return collectionEnabled
  }

  function stopActiveTimer(tabId: number) {
    const startTime = activeStartTimes.get(tabId)

    if (!startTime) return

    const duration = Date.now() - startTime
    activeStartTimes.delete(tabId)

    if (duration < 1000) return

    console.log(`Tab ${tabId} was active for ${formatTime(duration)}`)

    const event = {
      v: 1,
      sid: '',
      ts: Date.now(),
      type: 'active_time',
      tabId,
      duration,
      userActive
    }

    saveEvent(event)

    browser.tabs.get(tabId, (tab) => {
      if (browser.runtime.lastError || !tab?.url) return

      upsertPage(tab.url, tab.title, duration)
    })
  }

  function startActiveTimer(tabId: number) {
    if (!collectionEnabled || !userActive || activeStartTimes.has(tabId)) {
      return
    }

    activeStartTimes.set(tabId, Date.now())
    console.log(`Started timer for tab ${tabId}`)
  }

  function handleAnalyticsEvent(event: any, tabId?: number) {
    db.events.add({
      ...event,
      tabId: tabId || activeTabId
    })

    if (event.type === 'page_view' && tabId) {
      upsertPage(event.page.url, event.page.title, 0)

      stopActiveTimer(tabId)
      startActiveTimer(tabId)
    }
  }

  function setupEventListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!collectionEnabled) {
        sendResponse({ success: false, reason: 'Collectionn disabled' })
      }

      if (message.type === 'analytics_event') {
        handleAnalyticsEvent(message.event, sender.tab?.id)
        sendResponse({ seccess: true })
      }
    })
  }

  async function init() {
    await updateCollectionEnabled()

    if (collectionEnabled) {
      setupEventListener()
    }
  }

  init()

  browser.tabs.onActivated.addListener(() => { })
  browser.tabs.onRemoved.addListener(() => { })
  browser.idle.onStateChanged.addListener(() => { })
  browser.runtime.onInstalled.addListener(() => { })
  browser.runtime.onSuspend.addListener(() => { })
})