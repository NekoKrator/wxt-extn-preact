export interface Page {
  id?: number
  url: string
  domain: string
  title: string

  firstVisit: number
  lastVisit: number
  createdAt: number
  updatedAt: number

  totalActiveTime: number
  currentSessionStart?: number
  visitCount: number
}

export interface Event {
  id?: number
  pageId: number
  sessionId: string
  timestamp: number
  type: EventType
  data?: EventData
}

export type EventType =
  | 'page_view'
  | 'focus_gain'
  | 'focus_lost'
  | 'visibility_change'
  | 'tab_close'
  | 'session_start'
  | 'session_end'
  | 'idle_start'
  | 'idle_end'

  // L2
  | 'scroll_depth_%'
  | 'click'
  | 'keydown'
  | 'form_focus'
  | 'form_blur'
  | 'form_submit'
  | 'spa_route_change'

export interface EventData {
  activeTimeMs?: number
  referrer?: string

  // L2
  scrollDepth?: number
  clickX?: number
  clickY?: number
  elementSelector?: string
  keyCount?: number
  routeFrom?: string
  routeTo?: string
}

export interface Session {
  id?: number
  sessionId: string
  startTime: number
  endTime?: number
  isActive: boolean
  userAgent?: string
}

export interface Setting {
  id?: number
  key: string
  value: any
  updatedAt: number
}

export interface DomainRule {
  id?: number
  domain: string
  ruleType: 'whitelist' | 'blacklist' | 'privacy_sensitive'
  isActive: boolean
  createdAt: number
}