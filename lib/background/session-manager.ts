import { Dexie } from 'dexie';

interface AnalyticsDB extends Dexie {
  sessions: Dexie.Table<any, number>;
}

export class SessionManager {
  private static instance: SessionManager;
  private currentSessionId: string | null = null;
  private sessionStartTime: number | null = null;
  private db: AnalyticsDB;

  constructor(db: AnalyticsDB) {
    this.db = db;
  }

  static getInstance(db?: AnalyticsDB): SessionManager {
    if (!SessionManager.instance && db) {
      SessionManager.instance = new SessionManager(db);
    }
    return SessionManager.instance;
  }

  getCurrentSessionId(): string {
    if (!this.currentSessionId) {
      this.startSession();
    }
    return this.currentSessionId!;
  }

  async startSession(): Promise<string> {
    if (this.currentSessionId) {
      await this.endSession();
    }

    this.currentSessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.sessionStartTime = Date.now();

    await this.db.sessions.add({
      sessionId: this.currentSessionId,
      startTime: this.sessionStartTime,
      isActive: true
    });

    console.log(`Started new session: ${this.currentSessionId}`);
    return this.currentSessionId;
  }

  async endSession() {
    if (!this.currentSessionId) return;

    const endTime = Date.now();
    await this.db.sessions.where('sessionId').equals(this.currentSessionId).modify({
      endTime,
      isActive: false
    });

    console.log(`Ended session ${this.currentSessionId}`);
    this.currentSessionId = null;
    this.sessionStartTime = null;
  }

  async initialize() {
    const activeSessions = await this.db.sessions.where('isActive').equals(1).toArray();
    if (activeSessions.length > 0) {
      console.log(`Found ${activeSessions.length} unclosed sessions, closing them`);
      const endTime = Date.now();
      await Promise.all(
        activeSessions.map(session =>
          this.db.sessions.update(session.id!, {
            endTime,
            isActive: false
          })
        )
      );
    }
    await this.startSession();
  }
}