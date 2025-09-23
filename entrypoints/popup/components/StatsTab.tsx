import { formatTime } from '../utils/time';
import type { Stats } from '../utils/types';

interface StatsTabProps {
  stats: Stats;
  onExport: () => void;
  onClear: () => void;
}

const StatsTab = ({ stats, onExport, onClear }: StatsTabProps) => {
  const totalTime = stats.topDomains.reduce((sum, d) => sum + d.totalTime, 0);
  const totalVisits = stats.topDomains.reduce(
    (sum, d) => sum + d.visitCount,
    0
  );
  const totalPages = stats.topDomains.reduce((sum, d) => sum + d.pageCount, 0);

  return (
    <div class='stats-tab'>
      {/* Overview stats */}
      <div class='overview-stats'>
        <div class='stat-card'>
          <div class='stat-value'>{formatTime(stats.todayTime)}</div>
          <div class='stat-label'>Today</div>
        </div>
        <div class='stat-card'>
          <div class='stat-value'>{formatTime(totalTime)}</div>
          <div class='stat-label'>All Time</div>
        </div>
        <div class='stat-card'>
          <div class='stat-value'>{totalVisits}</div>
          <div class='stat-label'>Total Visits</div>
        </div>
        <div class='stat-card'>
          <div class='stat-value'>{totalPages}</div>
          <div class='stat-label'>Pages Visited</div>
        </div>
      </div>

      {/* Detailed domain stats */}
      <div class='detailed-stats'>
        <h3>Detailed Statistics</h3>

        {stats.topDomains.length === 0 ? (
          <div class='empty-state'>
            <p>No data available</p>
            <small>Start browsing to see detailed statistics</small>
          </div>
        ) : (
          <div class='domain-details'>
            {stats.topDomains.map((domain, index) => {
              const avgTimePerVisit =
                domain.visitCount > 0
                  ? domain.totalTime / domain.visitCount
                  : 0;
              const percentage =
                totalTime > 0
                  ? ((domain.totalTime / totalTime) * 100).toFixed(1)
                  : '0.0';

              return (
                <div
                  key={`${domain.domain}-${index}`}
                  class='domain-detail-card'
                >
                  <div class='domain-header'>
                    <h4 class='domain-title'>{domain.domain}</h4>
                    <span class='domain-percentage'>{percentage}%</span>
                  </div>

                  <div class='domain-metrics'>
                    <div class='metric'>
                      <span class='metric-label'>Total Time:</span>
                      <span class='metric-value'>
                        {formatTime(domain.totalTime)}
                      </span>
                    </div>
                    <div class='metric'>
                      <span class='metric-label'>Visits:</span>
                      <span class='metric-value'>{domain.visitCount}</span>
                    </div>
                    <div class='metric'>
                      <span class='metric-label'>Pages:</span>
                      <span class='metric-value'>{domain.pageCount}</span>
                    </div>
                    <div class='metric'>
                      <span class='metric-label'>Avg per visit:</span>
                      <span class='metric-value'>
                        {formatTime(avgTimePerVisit)}
                      </span>
                    </div>
                  </div>

                  <div class='time-bar'>
                    <div
                      class='time-bar-fill'
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div class='stats-actions'>
        <button class='btn btn-secondary' onClick={onExport}>
          Export Data
        </button>
        <button class='btn btn-danger' onClick={onClear}>
          Clear All Data
        </button>
      </div>
    </div>
  );
};

export default StatsTab;
