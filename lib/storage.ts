import { db } from './database'
import type { AnalyticsEvent } from './types'

export async function saveEvent(event: AnalyticsEvent) {
  try {
    await db.events.add(event)
  } catch (error) {
    console.error('Failed to save event:', error)
    throw error
  }
}

export async function upsertPage(url: string, title?: string, additionalTime: number = 0) {
  try {
    const existingPage = await db.pages.where('url').equals(url).first()

    if (existingPage) {
      await db.pages.update(existingPage.id!, {
        title: title || existingPage.title,
        totalTime: existingPage.totalTime + additionalTime,
        visitCount: existingPage.visitCount + (additionalTime > 0 ? 0 : 1),
        lastVisit: Date.now()
      })
    } else {
      await db.pages.add({
        url,
        title: title || '',
        totalTime: additionalTime,
        visitCount: 1,
        firstVisit: Date.now(),
        lastVisit: Date.now(),
      })
    }
  } catch (error) {
    console.log('Failed to upsert page:', error)
    throw error
  }
}



export async function getTotalTimeForTab(tabId: number, startTime: number, endTime: number): Promise<number> {
  const startDate = new Date(startTime)
  const endDate = new Date(endTime)

  return await db.getActiveTimeForTab(tabId, startDate, endDate)
}

export async function getStatistic(tabId: number, startTime: number, endTime: number) {
  const events = await db.events
    .where('ts')
    .between(startTime, endTime)
    .filter(event => event.tabId === tabId)
    .toArray()

  return {
    totalEvents: events.length,
    pageViews: events.filter(event => event.type === 'page_view').length,
    activeTime: events
      .filter(event => event.type === 'active_time')
      .reduce((sum, event) => sum + (event.duration || 0), 0),
    visibilityChanges: events.filter(event => event.type === 'visibility_change').length,
    FocusEvent: events.filter(event => event.type === 'focus_gain' || event.type === 'focus_lost').length
  }
}

export { db }