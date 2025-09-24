export interface ActiveTab {
  tabId: number
  pageId: number
  url: string
  domain: string
  isVisible: boolean
  isIdle: boolean
  lastActivityTime: number
}

export interface BaseMessage {
  type: string
  data?: any
  timestamp?: number
}

export interface PageData {
  id?: number
  url: string
  domain: string
  title: string
  firstVisit: number
  lastVisit: number
  totalActiveTime: number
  visitCount: number
  currentSessionStart?: number
}

export interface EventData {
  id?: number
  pageId: number
  sessionId: string
  timestamp: number
  type: string
  data?: any
}

export interface SessionData {
  id?: number
  sessionId: string
  startTime: number
  endTime?: number
  isActive: boolean
}

export interface DomainStats {
  domain: string
  totalTime: number
  pageCount: number
  visitCount: number
}

export interface StatsResponse {
  topDomains: DomainStats[]
  currentTab: {
    url: string
    domain: string
    activeTime: number
  } | null
}

export interface ExportData {
  pages: PageData[]
  events: EventData[]
  sessions: SessionData[]
  exportDate: string
  version: string
}