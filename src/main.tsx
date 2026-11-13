import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/product/figma-phase1.css';
import './components/client/client-login.css';
import './components/client/account-pages.css';
import './components/broker/lessor-activation.css';
import './components/product/customer-pages.css';
import './components/mahwar/mihwar-wheel.css';
import './components/product/remaining-sections.css';
import './mobile-native.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
