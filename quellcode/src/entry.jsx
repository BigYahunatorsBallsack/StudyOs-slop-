import { startRuntime } from './runtime.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppLock } from './ui/AppLock.jsx';
import { lockConfig } from './lib/applock.js';
startRuntime();
const show = () => createRoot(document.getElementById('root')).render(<React.StrictMode><AppLock><App /></AppLock></React.StrictMode>);
/* Erst rendern, wenn der gespeicherte Stand gelesen ist (runtime.js hat ihn schon angefordert): Bis dahin steht der
   Starttext aus index.html da, danach gleich „Heute“ mit Inhalt, ohne leeren Zwischenstand. Mit App-Sperre sofort. */
const boot = window.STUDYOS_ENV && window.STUDYOS_ENV.initialLoad();
if (!boot || lockConfig()) show(); else boot.promise.then(show);
