import { h } from 'preact';

interface PopupFooterProps {
  isTrackingEnabled: boolean;
  onToggleTracking: () => void;
  onExport: () => void;
  onClear: () => void;
  onOpenOptions: () => void;
}

const PopupFooter = ({
  isTrackingEnabled,
  onToggleTracking,
  onExport,
  onClear,
  onOpenOptions,
}: PopupFooterProps) => (
  <footer class='popup-footer'>
    <button
      onClick={onToggleTracking}
      class={`btn ${isTrackingEnabled ? 'btn-secondary' : 'btn-primary'}`}
    >
      {isTrackingEnabled ? 'Pause' : 'Resume'} Tracking
    </button>

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
  </footer>
);

export default PopupFooter;
