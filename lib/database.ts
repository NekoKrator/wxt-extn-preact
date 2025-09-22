import Dexie, { type Table } from 'dexie';
import type { AnalyticsEvent, PageInfo } from './types';

export class AnalyticsDB extends Dexie {
  events!: Table<AnalyticsEvent>;
  pages!: Table<PageInfo>;

  constructor() {
    super('AnalyticsDB');

    this.version(1).stores({
      events: '++id, type, ts, sid, tabId, url',
      pages: '++id, url, title, firstVisit, lastVisit, totalTime, visitCount'
    });

  }

  async getTodayEvents(): Promise<AnalyticsEvent[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    return await this.events
      .where('ts')
      .above(todayStart)
      .toArray();
  }

  async getTodayActiveTime(): Promise<number> {
    const todayEvents = await this.getTodayEvents();

    return todayEvents
      .filter(event => event.type === 'active_time')
      .reduce((total, event) => total + (event.duration || 0), 0);
  }

  async getPageViewsToday(): Promise<number> {
    const todayEvents = await this.getTodayEvents();

    return todayEvents.filter(event => event.type === 'page_view').length;
  }

  async getEventsForDateRange(startDate: Date, endDate: Date): Promise<AnalyticsEvent[]> {
    return await this.events
      .where('ts')
      .between(startDate.getTime(), endDate.getTime())
      .toArray();
  }

  async getActiveTimeForTab(tabId: number, startDate?: Date, endDate?: Date): Promise<number> {
    let query = this.events.where('tabId').equals(tabId);

    if (startDate && endDate) {
      const events = await query.toArray();
      const filtered = events.filter(e =>
        e.ts >= startDate.getTime() &&
        e.ts <= endDate.getTime() &&
        e.type === 'active_time'
      );
      return filtered.reduce((sum, e) => sum + (e.duration || 0), 0);
    }

    const events = await query.and(e => e.type === 'active_time').toArray();

    return events.reduce((sum, e) => sum + (e.duration || 0), 0);
  }

  async exportAllData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const events = await this.events.orderBy('ts').toArray();

    if (format === 'csv') {
      const headers = [
        'timestamp', 'type', 'url', 'title', 'duration',
        'sessionId', 'tabId', 'userActive', 'visible'
      ];

      const rows = events.map(event => [
        new Date(event.ts).toISOString(),
        event.type,
        event.page?.url || event.url || '',
        event.page?.title || event.title || '',
        event.duration || '',
        event.sid,
        event.tabId || '',
        event.userActive !== undefined ? event.userActive : '',
        event.visible !== undefined ? event.visible : ''
      ]);

      return [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    return JSON.stringify(events, null, 2)
  }
}

export const db = new AnalyticsDB();
