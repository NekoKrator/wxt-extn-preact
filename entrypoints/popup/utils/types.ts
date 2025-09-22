export interface Stats {
  todayTime: number;
  isTrackingEnabled: boolean;
  topDomains: Array<{
    domain: string;
    totalTime: number;
    pageCount: number;
    visitCount: number;
  }>;
  currentTab?: {
    url: string;
    domain: string;
    activeTime: number;
  };
}