// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
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
  vite: () => ({
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat',
      },
    },
    define: {
      global: 'globalThis',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  }),
  webExt: {
    chromiumArgs: ['--disable-extensions-except=dist', '--load-extension=dist']
  },
});