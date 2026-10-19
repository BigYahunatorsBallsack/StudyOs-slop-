import { startRuntime } from './runtime.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
startRuntime();
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
