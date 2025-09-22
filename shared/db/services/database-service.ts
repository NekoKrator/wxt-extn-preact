import { db } from '../schema'
import type { Page, Event, EventData, EventType } from '@/shared/types/database';
import { cleanUrl, extractDomain } from '../../utils/url-utils';

export class DatabaseService {

  // ===== УПРАВЛЕНИЕ СТРАНИЦАМИ =====

  /**
   * Найти или создать страницу
   */
  static async upsertPage(url: string, title: string): Promise<Page> {
    const cleanedUrl = cleanUrl(url);
    const domain = extractDomain(cleanedUrl);

    // Ищем существующую страницу
    const existingPage = await db.pages
      .where('url')
      .equals(cleanedUrl)
      .first();

    if (existingPage) {
      // Обновляем информацию о существующей странице
      const updatedPage = {
        ...existingPage,
        title,
        lastVisit: Date.now(),
        visitCount: existingPage.visitCount + 1
      };

      await db.pages.update(existingPage.id!, {
        title: updatedPage.title,
        lastVisit: updatedPage.lastVisit,
        visitCount: updatedPage.visitCount,
        updatedAt: Date.now()
      });

      return updatedPage;
    }

    // Создаем новую страницу
    const now = Date.now();
    const newPage: Omit<Page, 'id'> = {
      url: cleanedUrl,
      domain,
      title,
      firstVisit: now,
      lastVisit: now,
      createdAt: now,
      updatedAt: now,
      totalActiveTime: 0,
      visitCount: 1
    };

    const pageId = await db.pages.add(newPage);
    return { ...newPage, id: pageId };
  }

  /**
   * Начать активную сессию на странице
   */
  static async startPageActivity(pageId: number): Promise<void> {
    const page = await db.pages.get(pageId);
    if (!page) return;

    // Проверяем, что сессия еще не началась
    if (!page.currentSessionStart) {
      await db.pages.update(pageId, {
        currentSessionStart: Date.now(),
        lastVisit: Date.now()
      });
    }
  }

  /**
   * Завершить активную сессию на странице
   */
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

  /**
   * Получить текущее активное время страницы (включая активную сессию)
   */
  static async getCurrentActiveTime(pageId: number): Promise<number> {
    const page = await db.pages.get(pageId);
    if (!page) return 0;

    const currentSessionTime = page.currentSessionStart
      ? Date.now() - page.currentSessionStart
      : 0;

    return page.totalActiveTime + currentSessionTime;
  }

  // ===== УПРАВЛЕНИЕ СОБЫТИЯМИ =====

  /**
   * Добавить событие
   */
  static async addEvent(
    pageId: number,
    sessionId: string,
    type: EventType,
    data?: EventData
  ): Promise<void> {
    await db.events.add({
      pageId,
      sessionId,
      timestamp: Date.now(),
      type,
      data
    });
  }

  /**
   * Получить события страницы
   */
  static async getPageEvents(
    pageId: number,
    eventTypes?: EventType[],
    startTime?: number,
    endTime?: number
  ): Promise<Event[]> {
    let query = db.events.where('pageId').equals(pageId);

    const events = await query.toArray();

    return events.filter(event => {
      // Фильтр по типам событий
      if (eventTypes && !eventTypes.includes(event.type)) {
        return false;
      }

      // Фильтр по времени
      if (startTime && event.timestamp < startTime) {
        return false;
      }

      if (endTime && event.timestamp > endTime) {
        return false;
      }

      return true;
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  // ===== СТАТИСТИКА =====

  /**
   * Получить статистику по домену
   */
  static async getDomainStats(domain: string) {
    const pages = await db.pages.where('domain').equals(domain).toArray();

    const totalActiveTime = pages.reduce((sum, page) => {
      const currentSession = page.currentSessionStart
        ? Date.now() - page.currentSessionStart
        : 0;
      return sum + page.totalActiveTime + currentSession;
    }, 0);

    const totalVisits = pages.reduce((sum, page) => sum + page.visitCount, 0);

    return {
      domain,
      pageCount: pages.length,
      totalActiveTime,
      totalVisits,
      avgTimePerPage: pages.length > 0 ? totalActiveTime / pages.length : 0,
      avgTimePerVisit: totalVisits > 0 ? totalActiveTime / totalVisits : 0,
      pages: pages.sort((a, b) => b.totalActiveTime - a.totalActiveTime)
    };
  }

  /**
   * Получить топ доменов
   */
  static async getTopDomains(limit = 10): Promise<Array<{
    domain: string;
    totalTime: number;
    pageCount: number;
    visitCount: number;
  }>> {
    const pages = await db.pages.toArray();
    const domainMap = new Map<string, {
      totalTime: number;
      pageCount: number;
      visitCount: number;
    }>();

    pages.forEach(page => {
      const currentSession = page.currentSessionStart
        ? Date.now() - page.currentSessionStart
        : 0;
      const totalTime = page.totalActiveTime + currentSession;

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

  /**
   * Получить активное время за сегодня
   */
  static async getTodayActiveTime(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = startOfDay.getTime();

    const pages = await db.pages
      .where('lastVisit')
      .aboveOrEqual(startTimestamp)
      .toArray();

    return pages.reduce((total, page) => {
      // Считаем только время активности после начала дня
      const pageEvents = db.events
        .where('pageId').equals(page.id!)
        .and(event => event.timestamp >= startTimestamp)
        .toArray();

      // Здесь нужна более сложная логика для подсчета времени за день
      // Пока используем простую аппроксимацию
      const todayTime = page.lastVisit >= startTimestamp
        ? page.totalActiveTime
        : 0;

      const currentSession = page.currentSessionStart && page.currentSessionStart >= startTimestamp
        ? Date.now() - page.currentSessionStart
        : 0;

      return total + todayTime + currentSession;
    }, 0);
  }

  /**
   * Получить детальную статистику страницы с сессиями
   */
  static async getPageDetailedStats(pageId: number) {
    const page = await db.pages.get(pageId);
    if (!page) return null;

    const events = await this.getPageEvents(pageId, ['focus_gain', 'focus_lost']);

    // Построить активные сессии из событий
    const activeSessions: Array<{
      start: number;
      end: number;
      duration: number;
    }> = [];

    let currentStart: number | null = null;

    events.forEach(event => {
      if (event.type === 'focus_gain') {
        currentStart = event.timestamp;
      } else if (event.type === 'focus_lost' && currentStart) {
        const duration = event.timestamp - currentStart;
        activeSessions.push({
          start: currentStart,
          end: event.timestamp,
          duration
        });
        currentStart = null;
      }
    });

    // Добавить текущую активную сессию, если есть
    if (page.currentSessionStart) {
      activeSessions.push({
        start: page.currentSessionStart,
        end: Date.now(),
        duration: Date.now() - page.currentSessionStart
      });
    }

    // Статистика сессий
    const sessionDurations = activeSessions.map(s => s.duration);
    const avgSessionTime = sessionDurations.length > 0
      ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
      : 0;
    const maxSessionTime = sessionDurations.length > 0 ? Math.max(...sessionDurations) : 0;
    const minSessionTime = sessionDurations.length > 0 ? Math.min(...sessionDurations) : 0;

    return {
      ...page,
      sessionCount: activeSessions.length,
      avgSessionTime,
      maxSessionTime,
      minSessionTime,
      activeSessions
    };
  }

  // ===== ОЧИСТКА ДАННЫХ =====

  /**
   * Удалить все данные
   */
  static async clearAllData(): Promise<void> {
    await db.transaction('rw', [db.pages, db.events, db.sessions], async () => {
      await db.pages.clear();
      await db.events.clear();
      await db.sessions.clear();
    });
  }

  /**
   * Удалить данные старше указанного периода
   */
  static async cleanupOldData(daysToKeep: number): Promise<void> {
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    await db.transaction('rw', [db.pages, db.events], async () => {
      // Удаляем старые события
      await db.events.where('timestamp').below(cutoffDate).delete();

      // Удаляем страницы, которые не посещались давно
      await db.pages.where('lastVisit').below(cutoffDate).delete();
    });
  }
}