import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme/tokens.css';
import './styles.css';
import { App } from './App';
import { PilotDataProvider } from './data/pilot/PilotDataProvider';

// Concrete provider wiring point; PilotDataProvider serves real NASA Artemis data with mock fallback.
const provider = new PilotDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App provider={provider} />
  </StrictMode>,
);
