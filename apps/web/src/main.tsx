import 'leaflet/dist/leaflet.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// В мобильном приложении файлы и так лежат на устройстве — service worker не нужен
if (import.meta.env.PROD && import.meta.env.VITE_STANDALONE !== 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // без офлайн-режима приложение всё равно работает
    });
  });
}
