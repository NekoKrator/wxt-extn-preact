import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../../shared/utils/messaging';
import { Pause, Play } from 'lucide-react';
import { formatTime } from './utils/time';
import './style.css';
import { browser } from 'wxt/browser';
import PopupFooter from './components/PopupFooter';
import ActivityChart from './components/ActivityChart';
import type { Stats } from './utils/types';

const PopupApp = () => {
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
  }, [loadStats]);

  const handleToggleTracking = useCallback(async () => {
    if (!stats) {
      return;
    }

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
    if (!confirm('Clear all data? This cannot be undone.')) {
      return;
    }

    try {
      await sendMessage('CLEAR_DATA');
      await loadStats();
      alert('Data cleared');
    } catch (error) {
      console.error(error);
      alert('Failed to clear data');
    }
  }, [loadStats]);

  const handleOpenOptions = useCallback(() => {
    try {
      if (typeof browser !== 'undefined') {
        browser.runtime.openOptionsPage();
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  if (loading) {
    return <div class='loading'>Loading...</div>;
  }

  if (error) {
    return <div class='error'>{error}</div>;
  }

  if (!stats) {
    return <div class='error'>No data available</div>;
  }

  return (
    <div class='popup-container'>
      <header class='popup-header'>
        <h1>Activity Analytics</h1>
        <div class={`status ${stats.isTrackingEnabled ? 'active' : 'paused'}`}>
          {stats.isTrackingEnabled ? <Play size={15} /> : <Pause size={15} />}
          {stats.isTrackingEnabled ? 'Active' : 'Paused'}
        </div>
      </header>

      <main class='popup-main'>
        <section class='today-stats'>
          <h2>Today's Activity</h2>
          <div class='stat-card'>
            <div class='stat-value'>{formatTime(stats.todayTime)}</div>
            <div class='stat-label'>Active Time</div>
          </div>
        </section>

        <ActivityChart domains={stats.topDomains} />

        {stats.currentTab ? (
          <section class='current-tab'>
            <h3>Current Tab</h3>
            <div class='tab-info'>
              <div class='domain'>{stats.currentTab.domain}</div>
              <div class='time'>{formatTime(stats.currentTab.activeTime)}</div>
            </div>
          </section>
        ) : null}

        {!stats.topDomains || stats.topDomains.length === 0 ? null : (
          <section class='top-domains'>
            <h3>Top Sites</h3>
            <div class='domain-list'>
              {stats.topDomains.slice(0, 5).map((d, i) => (
                <div key={`${d.domain}-${i}`} class='domain-item'>
                  <div class='domain-name'>{d.domain}</div>
                  <div class='domain-time'>{formatTime(d.totalTime)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
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
  if (appElement) render(<PopupApp />, appElement);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
