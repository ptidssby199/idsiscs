import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register VitePWA Service Worker (skip inside native Capacitor WebView)
const isCapacitorNative =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

if (typeof window !== 'undefined' && !isCapacitorNative) {
  // Clean up legacy manual caches & mismatched dev service workers if present
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.startsWith('iscs-engine-cache-')) {
          caches.delete(key);
        }
      });
    });
  }

  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (scriptUrl.endsWith('/sw.js')) {
          reg.unregister();
        }
      });
    });
  }

  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('ISCS Engine siap digunakan secara offline.');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
