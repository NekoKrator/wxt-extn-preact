class DatabaseService {
  static async upsertPage(url: string, title: string) {
    const cleanedUrl = cleanUrl(url);
    const domain = extractDomain(cleanedUrl);

    const existingPage = await db.pages
      .where('url')
      .equals(cleanedUrl)
      .first();

    if (existingPage) {
      const updatedPage = {
        ...existingPage,
        title,
        lastVisit: Date.now(),
        visitCount: existingPage.visitCount + 1
      };

      await db.pages.update(existingPage.id!, {
        title: updatedPage.title,
        lastVisit: updatedPage.lastVisit,
        visitCount: updatedPage.visitCount
      });

      return updatedPage;
    }

    const now = Date.now();
    const newPage = {
      url: cleanedUrl,
      domain,
      title,
      firstVisit: now,
      lastVisit: now,
      totalActiveTime: 0,
      visitCount: 1
    };

    const pageId = await db.pages.add(newPage);
    return { ...newPage, id: pageId };
  }

  static async addEvent(pageId: number, sessionId: string, type: string, data?: any) {
    await db.events.add({
      pageId,
      sessionId,
      timestamp: Date.now(),
      type,
      data
    });
  }

  static async startPageActivity(pageId: number) {
    const page = await db.pages.get(pageId);
    if (!page || page.currentSessionStart) return;

    await db.pages.update(pageId, {
      currentSessionStart: Date.now(),
      lastVisit: Date.now()
    });
  }

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

  static async getTodayActiveTime(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pages = await db.pages.toArray();
    return pages.reduce((total, page) => {
      const currentSession = page.currentSessionStart && page.currentSessionStart >= startOfDay.getTime()
        ? Date.now() - page.currentSessionStart
        : 0;
      return total + page.totalActiveTime + currentSession;
    }, 0);
  }

  static async getAllTabs() {
    // const tabs = await db.pages.
  }

  static async getTopDomains(limit = 10) {
    const pages = await db.pages.toArray();
    const domainMap = new Map();

    pages.forEach(page => {
      const totalTime = page.totalActiveTime;

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

  static async getTabTotalTime(pageUrl: string) {
    const page = await db.pages.where('url').equals(pageUrl).first();

    return page.totalActiveTime
  }


  static async clearAllData() {
    await db.transaction('rw', [db.pages, db.events, db.sessions], async () => {
      await db.pages.clear();
      await db.events.clear();
      await db.sessions.clear();
    });
  }
}