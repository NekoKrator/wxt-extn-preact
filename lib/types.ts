export interface AnalyticsEvent {
  id?: number;
  v: number;
  sid: string;
  ts: number;
  type: string;
  tabId?: number;
  url?: string;
  title?: string;
  referrer?: string;
  visible?: boolean;
  duration?: number;
  userActive?: boolean;
  page?: {
    url: string;
    title: string;
    referrer?: string;
  };
}

export interface PageInfo {
  id?: number;
  url: string;
  title: string;
  totalTime: number;
  visitCount: number;
  firstVisit: number;
  lastVisit: number;
}