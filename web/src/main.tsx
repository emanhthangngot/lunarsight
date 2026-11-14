import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme/tokens.css';
import './styles.css';
import { App } from './App';
import { ApiDataProvider } from './data/api/ApiDataProvider';
import { PilotDataProvider } from './data/pilot/PilotDataProvider';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

// Concrete provider wiring point: use FastAPI backend when VITE_API_BASE_URL is configured, else static PilotDataProvider.
const provider = apiBaseUrl ? new ApiDataProvider(apiBaseUrl) : new PilotDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App provider={provider} />
  </StrictMode>,
);
