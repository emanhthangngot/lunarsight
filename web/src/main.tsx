import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme/tokens.css';
import './styles.css';
import { App } from './App';
import { MockDataProvider } from './data/mock/MockDataProvider';

// The only concrete-provider wiring point; UI consumers use the interface.
const provider = new MockDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App provider={provider} />
  </StrictMode>,
);
