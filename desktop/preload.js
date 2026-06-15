// Minimal preload — the app runs entirely in the renderer via the Vercel URL.
// No IPC needed; contextBridge left empty so the web app talks to the cloud directly.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('__isDesktop', true);
