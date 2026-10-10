import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './fonts.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/><Toaster position="bottom-right" richColors closeButton theme="dark" /></React.StrictMode>);
