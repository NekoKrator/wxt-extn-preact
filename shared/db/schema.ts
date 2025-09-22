import Dexie from 'dexie'

import type { Page, Event, Session, Setting, DomainRule } from '@/shared/types/database'

export class AnalyticsDB extends Dexie {
  pages!: Dexie.Table<Page, number>
  events!: Dexie.Table<Event, number>
  sessions!: Dexie.Table<Session, number>
  settings!: Dexie.Table<Setting, number>
  domain_rules!: Dexie.Table<DomainRule, number>

  constructor() {
    super('AnalyticsDB')

    this.version(1).stores({
      pages: '++id, url, domain, firstVisit, lastVisit, totalActiveTime',
      events: '++id, pageId, sessionId, timestamp, type',
      sessions: '++id, sessionId, startTime, endTime, isActive',
      settings: '++id, key',
      domain_rules: '++id, domain, ruleType'
    })

    this.pages.hook('creating', (primKey: any, obj: any, trans: any) => {
      const now = Date.now();

      obj.createdAt = now;
      obj.updatedAt = now;
    });

    this.pages.hook('updating', (modifications: any, primKey: any, obj: any, trans: any) => {
      modifications.updatedAt = Date.now();
    });
  }
}

export const db = new AnalyticsDB()