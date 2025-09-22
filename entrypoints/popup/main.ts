import { sendMessage } from '../../shared/utils/messaging'
import './style.css'

interface Stats {
  todayTime: number
  isTrackingEnabled: boolean
  topDomains: Array<{
    domain: string
    totalTime: number
    pageCount: number
    visitCount: number
  }>
  currentTab?: {
    url: string
    domain: string
    activeTime: number
  }
}

class PopupApp {
  private app: HTMLElement
  private stats: Stats | null = null

  constructor() {
    this.app = document.getElementById('app')!
    this.init()
  }

  private async init() {
    await this.loadStats()
    this.render()
    this.setupEventListeners()
  }

  private async loadStats() {
    try {
      const [todayTimeResponse, statsResponse, trackingResponse] = await Promise.all([
        sendMessage('GET_TODAY_TIME'),
        sendMessage('GET_STATS'),
        sendMessage('IS_TRACKING_ENABLED')
      ])

      this.stats = {
        todayTime: todayTimeResponse.data?.todayTime || 0,
        isTrackingEnabled: trackingResponse.data?.enabled || false,
        topDomains: statsResponse.data?.topDomains || [],
        currentTab: statsResponse.data?.currentTab
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
      this.stats = {
        todayTime: 0,
        isTrackingEnabled: false,
        topDomains: []
      }
    }
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  private render() {
    if (!this.stats) {
      this.app.innerHTML = '<div class="loading">Loading...</div>'
      return
    }

    this.app.innerHTML = `
      <div class="popup-container">
        <header class="popup-header">
          <h1>Activity Analytics</h1>
          <div class="status ${this.stats.isTrackingEnabled ? 'active' : 'paused'}">
            ${this.stats.isTrackingEnabled ? '●' : '⏸'}
            ${this.stats.isTrackingEnabled ? 'Active' : 'Paused'}
          </div>
        </header>

        <main class="popup-main">
          <section class="today-stats">
            <h2>Today's Activity</h2>
            <div class="stat-card">
              <div class="stat-value">${this.formatTime(this.stats.todayTime)}</div>
              <div class="stat-label">Active Time</div>
            </div>
          </section>

          ${this.stats.currentTab ? `
            <section class="current-tab">
              <h3>Current Tab</h3>
              <div class="tab-info">
                <div class="domain">${this.stats.currentTab.domain}</div>
                <div class="time">${this.formatTime(this.stats.currentTab.activeTime)}</div>
              </div>
            </section>
          ` : ''}

          ${this.stats.topDomains.length > 0 ? `
            <section class="top-domains">
              <h3>Top Sites</h3>
              <div class="domain-list">
                ${this.stats.topDomains.slice(0, 5).map(domain => `
                  <div class="domain-item">
                    <div class="domain-name">${domain.domain}</div>
                    <div class="domain-time">${this.formatTime(domain.totalTime)}</div>
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}
        </main>

        <footer class="popup-footer">
          <button id="toggle-tracking" class="btn ${this.stats.isTrackingEnabled ? 'btn-secondary' : 'btn-primary'}">
            ${this.stats.isTrackingEnabled ? 'Pause' : 'Resume'} Tracking
          </button>
          
          <div class="action-buttons">
            <button id="export-data" class="btn btn-small">Export</button>
            <button id="clear-data" class="btn btn-small btn-danger">Clear</button>
            <button id="open-options" class="btn btn-small">Options</button>
          </div>
        </footer>
      </div>
    `
  }

  private setupEventListeners() {
    const toggleBtn = document.getElementById('toggle-tracking')
    toggleBtn?.addEventListener('click', async () => {
      try {
        if (this.stats?.isTrackingEnabled) {
          await sendMessage('PAUSE_TRACKING')
        } else {
          await sendMessage('RESUME_TRACKING')
        }
        await this.loadStats()
        this.render()
        this.setupEventListeners()
      } catch (error) {
        console.error('Failed to toggle tracking:', error)
      }
    })

    // Export data
    const exportBtn = document.getElementById('export-data')
    exportBtn?.addEventListener('click', async () => {
      try {
        const response = await sendMessage('EXPORT_DATA')
        const data = JSON.stringify(response.data, null, 2)

        // Create blob and download
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = `activity-analytics-${new Date().toISOString().split('T')[0]}.json`
        a.click()

        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Failed to export data:', error)
        alert('Failed to export data')
      }
    })

    // Clear data
    const clearBtn = document.getElementById('clear-data')
    clearBtn?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        try {
          await sendMessage('CLEAR_DATA')
          await this.loadStats()
          this.render()
          this.setupEventListeners()
          alert('Data cleared successfully')
        } catch (error) {
          console.error('Failed to clear data:', error)
          alert('Failed to clear data')
        }
      }
    })

    // Open options
    const optionsBtn = document.getElementById('open-options')
    optionsBtn?.addEventListener('click', () => {
      browser.runtime.openOptionsPage()
    })
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupApp()
})