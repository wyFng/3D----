import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 关闭 modulePreload 内联 polyfill，让 CSP 的 script-src 'self' 可以严格生效
  build: {
    modulePreload: { polyfill: false },
    target: 'es2020'
  },
  server: { host: true }
});
