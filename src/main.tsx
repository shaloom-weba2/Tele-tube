import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { UploadProvider } from './context/UploadContext';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <UploadProvider>
          <App />
        </UploadProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
