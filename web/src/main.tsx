import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DemoCheckout } from './DemoCheckout';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('The web preview is missing its root element.');

const checkout = new URLSearchParams(window.location.search).get('demoCheckout');
createRoot(container).render(<StrictMode>{checkout === null ? <App /> : <DemoCheckout payload={checkout} />}</StrictMode>);
