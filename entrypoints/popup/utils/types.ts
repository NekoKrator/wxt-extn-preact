export interface DomainStat {
  domain: string
  totalTime: number
  pageCount: number
  visitCount: number
}

export interface TabStats {
  url: string
  domain: string
  activeTime: number
  lastScroll: number
  keydownCount: number
  lastClick: {
    tag: string
    id: string
    classes: string
    x: number
    y: number
  } | null
}

export interface Stats {
  todayTime: number
  isTrackingEnabled: boolean
  topDomains: DomainStat[]
  currentTab: TabStats | null
  groupedTabs: Record<string, DomainStat[]>
}
