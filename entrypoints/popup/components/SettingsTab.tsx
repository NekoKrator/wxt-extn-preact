import { useState, useEffect } from 'preact/hooks';
import {
  Play,
  Pause,
  Download,
  Trash2,
  Globe,
  Clock,
  Shield,
} from 'lucide-react';
import { sendMessage } from '../../../shared/utils/messaging';

interface SettingsTabProps {
  isTrackingEnabled: boolean;
  onToggleTracking: () => void;
  onExport: () => void;
  onClear: () => void;
}

const SettingsTab = ({
  isTrackingEnabled,
  onToggleTracking,
  onExport,
  onClear,
}: SettingsTabProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [badgeEnabled, setBadgeEnabled] = useState(true);

  useEffect(() => {
    // Load badge setting
    browser.storage.sync.get(['badgeEnabled']).then((result) => {
      setBadgeEnabled(result.badgeEnabled !== false);
    });
  }, []);

  const handleBadgeToggle = async (enabled: boolean) => {
    try {
      setBadgeEnabled(enabled);
      await sendMessage('SET_BADGE_ENABLED', { enabled });
      await browser.storage.sync.set({ badgeEnabled: enabled });
    } catch (error) {
      console.error('Failed to toggle badge:', error);
      setBadgeEnabled(!enabled); // Revert on error
    }
  };

  return (
    <div class='settings-tab'>
      {/* Main Settings */}
      <section class='settings-section'>
        <h3>
          <Globe size={18} />
          General Settings
        </h3>

        <div class='setting-item'>
          <div class='setting-info'>
            <label class='setting-label'>Activity Tracking</label>
            <p class='setting-description'>
              {isTrackingEnabled
                ? 'Currently tracking your browsing activity'
                : 'Tracking is paused - no new data is being collected'}
            </p>
          </div>
          <button
            class={`toggle-btn ${isTrackingEnabled ? 'active' : 'inactive'}`}
            onClick={onToggleTracking}
          >
            {isTrackingEnabled ? <Pause size={16} /> : <Play size={16} />}
            {isTrackingEnabled ? 'Pause' : 'Resume'}
          </button>
        </div>

        <div class='setting-item'>
          <div class='setting-info'>
            <label class='setting-label'>Badge Display</label>
            <p class='setting-description'>
              Show time spent on current tab in extension badge
            </p>
          </div>
          <label class='switch'>
            <input
              type='checkbox'
              checked={badgeEnabled}
              onChange={(e) =>
                handleBadgeToggle((e.target as HTMLInputElement).checked)
              }
            />
            <span class='slider'></span>
          </label>
        </div>

        <div class='setting-item'>
          <div class='setting-info'>
            <label class='setting-label'>Idle Detection</label>
            <p class='setting-description'>
              Stop tracking after 30 seconds of inactivity
            </p>
          </div>
          <div class='setting-value'>
            <Clock size={16} />
            <span>30s</span>
          </div>
        </div>
      </section>

      {/* Privacy Settings */}
      <section class='settings-section'>
        <h3>
          <Shield size={18} />
          Privacy Settings
        </h3>

        <div class='privacy-info'>
          <div class='privacy-item'>
            <span class='privacy-label'>✓ Data stored locally only</span>
          </div>
          <div class='privacy-item'>
            <span class='privacy-label'>
              ✓ No form data or passwords collected
            </span>
          </div>
          <div class='privacy-item'>
            <span class='privacy-label'>
              ✓ Incognito tabs excluded by default
            </span>
          </div>
          <div class='privacy-item'>
            <span class='privacy-label'>
              ✓ Banking/sensitive sites excluded
            </span>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section class='settings-section'>
        <h3>Data Management</h3>

        <div class='data-actions'>
          <button class='btn btn-secondary' onClick={onExport}>
            <Download size={16} />
            Export Data
          </button>

          <button class='btn btn-danger' onClick={onClear}>
            <Trash2 size={16} />
            Clear All Data
          </button>
        </div>

        <div class='data-info'>
          <p class='info-text'>
            Export your data as JSON for backup or analysis. Clearing data will
            permanently remove all tracking history.
          </p>
        </div>
      </section>

      {/* Advanced Settings */}
      <section class='settings-section'>
        <div
          class='section-header'
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <h3>Advanced Settings</h3>
          <span class={`expand-icon ${showAdvanced ? 'expanded' : ''}`}>▼</span>
        </div>

        {showAdvanced && (
          <div class='advanced-settings'>
            <div class='setting-item'>
              <div class='setting-info'>
                <label class='setting-label'>Detailed Logging</label>
                <p class='setting-description'>
                  Enable detailed activity logging for debugging
                </p>
              </div>
              <label class='switch'>
                <input type='checkbox' />
                <span class='slider'></span>
              </label>
            </div>

            <div class='setting-item'>
              <div class='setting-info'>
                <label class='setting-label'>Auto-cleanup</label>
                <p class='setting-description'>
                  Automatically remove data older than 90 days
                </p>
              </div>
              <label class='switch'>
                <input type='checkbox' defaultChecked />
                <span class='slider'></span>
              </label>
            </div>

            <div class='setting-item'>
              <div class='setting-info'>
                <label class='setting-label'>SPA Detection</label>
                <p class='setting-description'>
                  Track single-page application navigation
                </p>
              </div>
              <label class='switch'>
                <input type='checkbox' defaultChecked />
                <span class='slider'></span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Footer Info */}
      <div class='settings-footer'>
        <div class='version-info'>
          <p class='version'>Activity Analytics v1.0.0</p>
          <p class='build-info'>Built with privacy in mind</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
