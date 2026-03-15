import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import '../style.css';
import App from './App';

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
