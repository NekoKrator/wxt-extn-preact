import { db } from "@/shared/db/schema"
import type { Session } from "@/shared/types/database"
import { v4 as uuidv4 } from 'uuid'

/**
 * @class SessionManager
 *
 * manages user sessions in the extension for tracking activity
 *
 * what it does:
 * - starts and ends user sessions
 * - keeps the current session id and start time in memory
 * - saves session state when the extension starts
 * - gives stats and history of past sessions
 * - cleans up old sessions to save space
 *
 * main methods:
 * - {@link startSession} - start a new session (ends the old one if active).
 * - {@link endSession} - end the current session.
 * - {@link getCurrentSessionId} - get the current session id (creates one if none exists)
 * - {@link getCurrentSession} - get the session object from the database
 * - {@link getSessionStats} - get start for recent sessions
 * - {@link cleanupOldSessions} - delete sessions older than a set number of days
 * - {@link initialize} - fix any unclosed sessions and start a new one
 */
export class SessionManager {
  private static instance: SessionManager
  private currentSessionId: string | null = null
  private sessionStartTime: number | null = null

  private constructor() { }

  /**
   * returns the single instance of SessionManager (Singleton pattern)
   *
   * @returns {SessionManager}
   * the session manager instance
   */
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }

    return SessionManager.instance
  }

  /**
   * returns the current session ID
   * if no session exist yet, it start a new one
   *
   * @returns {string}
   * uuid of the current session
   */
  getCurrentSessionId(): string {
    if (!this.currentSessionId) {
      this.startSession();
    }

    return this.currentSessionId!;
  }

  /**
   * starts a new user session
   * if a sessin is already active, it ends it first
   * saves the sessions to the database and returns its id
   *
   * @returns {Promise<string>}
   * uuid of the new session
   */
  async startSession(): Promise<string> {
    if (this.currentSessionId) {
      await this.endSession()
    }

    this.currentSessionId = uuidv4()
    this.sessionStartTime = Date.now()

    const session: Omit<Session, 'id'> = {
      sessionId: this.currentSessionId,
      startTime: this.sessionStartTime,
      isActive: true
    }

    await db.sessions.add(session)

    console.log(`Started new session: ${this.currentSessionId}`)

    return this.currentSessionId
  }

  /**
   * ends the current session if it is active
   * updates the database to set the end time and marks the session as inactive
   */
  async endSession() {
    if (!this.currentSessionId) {
      return
    }

    const endTime = Date.now()

    await db.sessions.where('sessionId').equals(this.currentSessionId).modify({
      endTime,
      isActive: false
    })

    console.log(`Ended session ${this.currentSessionId}`)

    this.currentSessionId = null
    this.sessionStartTime = null
  }

  /**
   * checks if there is any active session
   *
   * @returns {boolean}
   * true if a session is currently ative
   */
  isSessionActive(): boolean {
    return this.currentSessionId !== null
  }

  /**
   * returns the duration of the current session in ms
   * if no session is running, returns 0
   *
   * @returns {number}
   * session duration in ms
   */
  getCurrentSessionTime(): number {
    if (!this.sessionStartTime) {
      return 0
    }

    return Date.now() - this.sessionStartTime
  }

  /**
   * gets the current session object from the database
   *
   * @returns {Promise<Session | null>}
   * the session data, or null if no session is active
   */
  async getCurrentSession() {
    if (!this.currentSessionId) {
      return null
    }

    return await db.sessions.where('sessionId').equals(this.currentSessionId).first() || null
  }

  /**
   * returns a list of sessions that started within a given time range
   *
   * @returns {Promise<Session[]>}
   * an array of session objects
   */
  async getSessionInRange(startTime: number, endTime: number) {
    return await db.sessions.where('starttime').between(startTime, endTime, true, true).toArray()
  }

  /**
   * returns session statistics for the last N days
   * includes total sessions, active and completed sessions, total and avarage duration,
   * maximum session duration, and daily stats
   *
   * @returns {Promise<{
   * totalSessions: number,
   * completedSessions: number
   * activeSession: number,
   * totalTime: number,
   * avgSessionTime: number,
   * maxSessionTime: number,
   * dailyStat: {date: string, count: number, totalTime: number}
   * }>}
   * session statistics data
   */
  async getSessionStats(days: number = 30) {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000)
    const session = await db.sessions.where('startTime').aboveOrEqual(cutoffTime).toArray()

    const completedSessions = session.filter(session => session.endTime)
    const sessionDurations = completedSessions.map(session => session.endTime! - session.startTime)

    const totalSessions = session.length
    const totalTime = sessionDurations.reduce((sum, duration) => sum + duration, 0)
    const avgSessionTime = totalSessions > 0 ? totalTime / totalSessions : 0
    const maxSessionTime = sessionDurations.length > 0 ? Math.max(...sessionDurations) : 0

    const dailyStats = new Map<string, { count: number; totalTime: number }>()

    completedSessions.forEach(session => {
      const date = new Date(session.startTime).toDateString()
      const duration = session.endTime! - session.startTime

      const existing = dailyStats.get(date) || { count: 0, totalTime: 0 }
      dailyStats.set(date, {
        count: existing.count + 1,
        totalTime: existing.totalTime + duration
      })
    })

    return {
      totalSessions,
      completedSessions: completedSessions.length,
      activeSessions: session.filter(session => session.isActive).length,
      totalTime,
      avgSessionTime,
      maxSessionTime,
      dailyStats: Array.from(dailyStats.entries()).map(([date, stats]) => ({
        date,
        ...stats
      }))
    }
  }

  /**
   * deletes sessions from the database that are older than the specified number of days
   */
  async cleanupOldSessions(daysToKeep: number = 90) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)

    await db.sessions.where('startTime').below(cutoffTime).delete()

    console.log(`Cleaned up sessions older than ${daysToKeep} days`)
  }

  /**
   * Initializes the session manager
   * closes any unclosed sessions and start a new one
   */
  async initialize() {
    const activeSessions = await db.sessions.where('isActive').equals(1).toArray()

    if (activeSessions.length > 0) {
      console.log(`Found ${activeSessions.length} unclosed session, closing them`)

      const endTime = Date.now()
      await Promise.all(
        activeSessions.map(session => {
          db.sessions.update(session.id!, {
            endTime,
            isActive: false
          })
        })
      )
    }

    await this.startSession()
  }

  /**
   * handler for when the extension is suspended
   * ends the current session
   */
  async handleExtensionSuspend() {
    await this.endSession()
  }
}