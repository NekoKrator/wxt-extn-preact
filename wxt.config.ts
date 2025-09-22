import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Activity Analytics',
    version: '1.0.0',
    description: 'Privacy-focused web activity analytics extension',
    permissions: [
      'storage',
      'tabs',
      'idle',
      'alarms',
      'activeTab'
    ],
    host_permissions: [
      'https://*/*',
      'http://*/*'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    },
    action: {
      default_popup: 'popup/index.html',
      default_title: 'Activity Analytics'
    },
    options_page: 'options/index.html'
  },
  webExt: {
    chromiumArgs: ['--disable-extensions-except=dist', '--load-extension=dist']
  },
});