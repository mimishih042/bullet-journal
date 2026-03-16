import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import '../style.css';
import App from './App';

// Prevent browser pinch-to-zoom on iPad (Safari gesture events).
// Page-level pinch zoom is also blocked via touch-action: pan-x pan-y in style.css,
// which lets react-easy-crop's own touch-action:none handle pinch inside the modal.
document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
