import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../../shared/utils/messaging';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Home,
} from 'lucide-react';
import { formatTime } from './utils/time';
import './style.css';
import ActivityChart from './components/ActivityChart';
import StatsTab from './components/StatsTab';
import SettingsTab from './components/SettingsTab';
import type { Stats } from './utils/types';

type TabType = 'home' | 'stats' | 'settings';

const PopupApp = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedDate, setSelectedDate] = useState(new Date());

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
    } catch (error) {
      console.error('Failed to load stats:', error);
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
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const handleToggleTracking = useCallback(async () => {
    if (!stats) return;

    try {
      await sendMessage(
        stats.isTrackingEnabled ? 'PAUSE_TRACKING' : 'RESUME_TRACKING'
      );
      await loadStats();
    } catch (error) {
      console.error(error);
    }
  }, [stats, loadStats]);

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
    } catch (e) {
      console.error(e);
      alert('Failed to export data');
    }
  }, []);

  const handleClearData = useCallback(async () => {
    if (!confirm('Clear all data? This cannot be undone.')) return;

    try {
      await sendMessage('CLEAR_DATA');
      await loadStats();
      alert('Data cleared');
    } catch (error) {
      console.error(error);
      alert('Failed to clear data');
    }
  }, [loadStats]);

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const changeDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  if (loading) {
    return (
      <div class='popup-container'>
        <div class='loading'>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class='popup-container'>
        <div class='error'>{error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div class='popup-container'>
        <div class='error'>No data available</div>
      </div>
    );
  }

  const totalTime = stats.topDomains.reduce((sum, d) => sum + d.totalTime, 0);

  return (
    <div className='flex flex-col h-screen max-h-[600px]'>
      <header className='bg-[var(--background)] [border-bottom:1px_solid_var(--border)] p-0'>
        <div className='pt-[16px] px-[20px] pb-[12px] text-center [border-bottom:1px_solid_var(--border-light)]'>
          <span className='text-[24px] mb-[4px] block'>TEST</span>
          <h1 className='text-[18px] font-semibold ml-[0] mr-[0] my-[0]'>
            Activity Tracker
          </h1>
          {/* <p className='text-[13px] m-0'>Discover your browsing habits!</p> */}
        </div>

        <nav className='flex bg-[var(--surface)]'>
          <button
            class={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <Home size={16} />
            <span>Home</span>
          </button>
          <button
            class={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <BarChart3 size={16} />
            <span>Stats</span>
          </button>
          <button
            class={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </nav>
      </header>

      {/* Main content */}
      <main class='popup-main'>
        {activeTab === 'home' && (
          <>
            {/* Date navigation */}
            <div class='date-navigation'>
              <button class='date-nav-btn' onClick={() => changeDate('prev')}>
                <ChevronLeft size={16} />
              </button>

              <div class='date-info'>
                <span class='date-value'>{formatDate(selectedDate)}</span>
                <div class='date-labels'>
                  <span class='daily-average'>Daily average</span>
                  <span class='all-time'>All-time</span>
                </div>
              </div>

              <button
                class='date-nav-btn'
                onClick={() => changeDate('next')}
                disabled={isToday(selectedDate)}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Chart section */}
            <div class='chart-section'>
              <ActivityChart domains={stats.topDomains} totalTime={totalTime} />
            </div>

            {/* Website list */}
            <div class='website-list'>
              <h3>Today data</h3>

              {stats.topDomains.length === 0 ? (
                <div class='empty-state'>
                  <p>No browsing data for today</p>
                  <small>Start browsing to see your activity</small>
                </div>
              ) : (
                <div class='domain-items'>
                  {stats.topDomains.slice(0, 8).map((domain, index) => {
                    const percentage =
                      totalTime > 0
                        ? ((domain.totalTime / totalTime) * 100).toFixed(1)
                        : '0.0';

                    return (
                      <div key={`${domain.domain}-${index}`} class='domain-row'>
                        <div class='domain-info'>
                          <div class='domain-indicator'></div>
                          <span class='domain-name'>{domain.domain}</span>
                        </div>
                        <div class='domain-stats'>
                          <span class='domain-percentage'>{percentage} %</span>
                          <span class='domain-time'>
                            {formatTime(domain.totalTime)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div class='footer-actions'>
              <button
                onClick={handleToggleTracking}
                class={`action-btn ${
                  stats.isTrackingEnabled ? 'pause' : 'play'
                }`}
              >
                {stats.isTrackingEnabled ? 'Pause Tracking' : 'Resume Tracking'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'stats' && (
          <StatsTab
            stats={stats}
            onExport={handleExportData}
            onClear={handleClearData}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            isTrackingEnabled={stats.isTrackingEnabled}
            onToggleTracking={handleToggleTracking}
            onExport={handleExportData}
            onClear={handleClearData}
          />
        )}
      </main>
    </div>
  );
};

const initApp = () => {
  const appElement = document.getElementById('app');
  if (appElement) render(<PopupApp />, appElement);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
