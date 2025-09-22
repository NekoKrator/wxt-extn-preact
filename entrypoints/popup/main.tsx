import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../../shared/utils/messaging';
import { Pause, Play } from 'lucide-react';
import { formatTime } from './utils/time';
import './style.css';

interface Stats {
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

const PIE_COLORS = [
  '#44FF07',
  '#FED60A',
  '#FB0007',
  '#3700FF',
  '#FB13F3',
  '#6B7280',
];

const useStats = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [todayTimeResponse, statsResponse, trackingResponse] =
        await Promise.all([
          sendMessage('GET_TODAY_TIME'),
          sendMessage('GET_STATS'),
          sendMessage('IS_TRACKING_ENABLED'),
        ]);

      setStats({
        todayTime: todayTimeResponse.data?.todayTime || 0,
        isTrackingEnabled: trackingResponse.data?.enabled || false,
        topDomains: statsResponse.data?.topDomains || [],
        currentTab: statsResponse.data?.currentTab,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError('Failed to load data');
      setStats({
        todayTime: 0,
        isTrackingEnabled: false,
        topDomains: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, error, refetch: loadStats };
};

const LoadingComponent = () => <div class='loading'>Loading...</div>;

const ErrorComponent = ({ message }: { message: string }) => (
  <div class='error'>{message}</div>
);

const StatusHeader = ({
  isTrackingEnabled,
}: {
  isTrackingEnabled: boolean;
}) => (
  <header class='popup-header'>
    <h1>Activity Analytics</h1>
    <div class={`status ${isTrackingEnabled ? 'active' : 'paused'}`}>
      {/* {isTrackingEnabled ? '●' : '⏸'} */}
      {isTrackingEnabled ? <Play size={24} /> : <Pause size={24} />}
      {isTrackingEnabled ? 'Active' : 'Paused'}
    </div>
  </header>
);

const TodayStats = ({ todayTime }: { todayTime: number }) => (
  <section class='today-stats'>
    <h2>Today's Activity</h2>
    <div class='stat-card'>
      <div class='stat-value'>{formatTime(todayTime)}</div>
      <div class='stat-label'>Active Time</div>
    </div>
  </section>
);

const CurrentTab = ({ currentTab }: { currentTab?: Stats['currentTab'] }) => {
  if (!currentTab) return null;

  return (
    <section class='current-tab'>
      <h3>Current Tab</h3>
      <div class='tab-info'>
        <div class='domain'>{currentTab.domain}</div>
        <div class='time'>{formatTime(currentTab.activeTime)}</div>
      </div>
    </section>
  );
};

interface PieChartData {
  title: string;
  value: number;
  color: string;
}

interface SimplePieChartProps {
  data: PieChartData[];
  size?: number;
}

const SimplePieChart = ({ data, size = 120 }: SimplePieChartProps) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) return null;

  const center = size / 2;
  const radius = size * 0.35;

  let cumulativeAngle = 0;

  const slices = data.map((item, index) => {
    const angle = (item.value / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;

    cumulativeAngle += angle;

    // Calculate path for SVG arc
    const startAngleRad = (startAngle - 90) * (Math.PI / 180);
    const endAngleRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = center + radius * Math.cos(startAngleRad);
    const y1 = center + radius * Math.sin(startAngleRad);
    const x2 = center + radius * Math.cos(endAngleRad);
    const y2 = center + radius * Math.sin(endAngleRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z',
    ].join(' ');

    const percentage = ((item.value / total) * 100).toFixed(1);

    // Calculate text position
    const textAngle = (startAngle + angle / 2 - 90) * (Math.PI / 180);
    const textRadius = radius * 0.7;
    const textX = center + textRadius * Math.cos(textAngle);
    const textY = center + textRadius * Math.sin(textAngle);

    return {
      path: pathData,
      color: item.color,
      percentage,
      textX,
      textY,
      showText: angle > 30, // Only show percentage if slice is large enough
    };
  });

  return (
    <svg width={size} height={size} class='pie-chart-svg'>
      {slices.map((slice, index) => (
        <g key={index}>
          <path
            d={slice.path}
            fill={slice.color}
            stroke='#fff'
            stroke-width='2'
            class='pie-slice'
          />
          {slice.showText && (
            <text
              x={slice.textX}
              y={slice.textY}
              text-anchor='middle'
              dominant-baseline='middle'
              class='pie-text'
              fill='#fff'
              font-size='10'
              font-weight='bold'
            >
              {slice.percentage}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

const ActivityChart = ({ domains }: { domains: Stats['topDomains'] }) => {
  if (domains.length === 0) return null;

  // Prepare data for pie chart
  const totalTime = domains.reduce((sum, domain) => sum + domain.totalTime, 0);

  if (totalTime === 0) return null;

  // Get top 5 domains
  const topFive = domains.slice(0, 5);
  const topFiveTime = topFive.reduce(
    (sum, domain) => sum + domain.totalTime,
    0
  );
  const otherTime = totalTime - topFiveTime;

  const chartData = [
    ...topFive.map((domain, index) => ({
      title: domain.domain,
      value: domain.totalTime,
      color: PIE_COLORS[index],
    })),
  ];

  // Add "Other" segment if there are more than 5 domains
  if (domains.length > 5 && otherTime > 0) {
    chartData.push({
      title: 'Other',
      value: otherTime,
      color: PIE_COLORS[5],
    });
  }

  return (
    <section class='activity-chart'>
      <h3>Time Distribution</h3>
      <div class='chart-container'>
        <div class='pie-chart-wrapper'>
          <SimplePieChart data={chartData} size={120} />
        </div>
        <div class='chart-legend'>
          {chartData.map((entry, index) => (
            <div key={index} class='legend-item'>
              <div
                class='legend-color'
                style={{ backgroundColor: entry.color }}
              ></div>
              <div class='legend-info'>
                <div class='legend-domain'>{entry.title}</div>
                <div class='legend-time'>{formatTime(entry.value)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const TopDomains = ({ domains }: { domains: Stats['topDomains'] }) => {
  if (domains.length === 0) return null;

  return (
    <section class='top-domains'>
      <h3>Top Sites</h3>
      <div class='domain-list'>
        {domains.slice(0, 5).map((domain, index) => (
          <div key={`${domain.domain}-${index}`} class='domain-item'>
            <div class='domain-name'>{domain.domain}</div>
            <div class='domain-time'>{formatTime(domain.totalTime)}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const ActionButtons = ({
  onExport,
  onClear,
  onOpenOptions,
}: {
  onExport: () => void;
  onClear: () => void;
  onOpenOptions: () => void;
}) => (
  <div class='action-buttons'>
    <button onClick={onExport} class='btn btn-small'>
      Export
    </button>
    <button onClick={onClear} class='btn btn-small btn-danger'>
      Clear
    </button>
    <button onClick={onOpenOptions} class='btn btn-small'>
      Options
    </button>
  </div>
);

const PopupFooter = ({
  isTrackingEnabled,
  onToggleTracking,
  onExport,
  onClear,
  onOpenOptions,
}: {
  isTrackingEnabled: boolean;
  onToggleTracking: () => void;
  onExport: () => void;
  onClear: () => void;
  onOpenOptions: () => void;
}) => (
  <footer class='popup-footer'>
    <button
      onClick={onToggleTracking}
      class={`btn ${isTrackingEnabled ? 'btn-secondary' : 'btn-primary'}`}
    >
      {isTrackingEnabled ? 'Pause' : 'Resume'} Tracking
    </button>

    <ActionButtons
      onExport={onExport}
      onClear={onClear}
      onOpenOptions={onOpenOptions}
    />
  </footer>
);

const PopupApp = () => {
  const { stats, loading, error, refetch } = useStats();

  const handleToggleTracking = useCallback(async () => {
    if (!stats) return;

    try {
      if (stats.isTrackingEnabled) {
        await sendMessage('PAUSE_TRACKING');
      } else {
        await sendMessage('RESUME_TRACKING');
      }
      await refetch();
    } catch (error) {
      console.error('Failed to toggle tracking:', error);
    }
  }, [stats, refetch]);

  const handleExportData = useCallback(async () => {
    try {
      const response = await sendMessage('EXPORT_DATA');
      const data = JSON.stringify(response.data, null, 2);

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-analytics-${
        new Date().toISOString().split('T')[0]
      }.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data:', error);
      alert('Failed to export data');
    }
  }, []);

  const handleClearData = useCallback(async () => {
    if (
      !confirm(
        'Are you sure you want to clear all data? This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await sendMessage('CLEAR_DATA');
      await refetch();
      alert('Data cleared successfully');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data');
    }
  }, [refetch]);

  const handleOpenOptions = useCallback(() => {
    try {
      if (typeof browser !== 'undefined' && browser.runtime) {
        browser.runtime.openOptionsPage();
      } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.openOptionsPage();
      }
    } catch (error) {
      console.error('Failed to open options page:', error);
    }
  }, []);

  if (loading) {
    return <LoadingComponent />;
  }

  if (error) {
    return <ErrorComponent message={error} />;
  }

  if (!stats) {
    return <ErrorComponent message='No data available' />;
  }

  return (
    <div class='popup-container'>
      <StatusHeader isTrackingEnabled={stats.isTrackingEnabled} />

      <main class='popup-main'>
        <TodayStats todayTime={stats.todayTime} />
        <ActivityChart domains={stats.topDomains} />
        <CurrentTab currentTab={stats.currentTab} />
        <TopDomains domains={stats.topDomains} />
      </main>

      <PopupFooter
        isTrackingEnabled={stats.isTrackingEnabled}
        onToggleTracking={handleToggleTracking}
        onExport={handleExportData}
        onClear={handleClearData}
        onOpenOptions={handleOpenOptions}
      />
    </div>
  );
};

const initApp = () => {
  const appElement = document.getElementById('app');
  if (appElement) {
    render(<PopupApp />, appElement);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
