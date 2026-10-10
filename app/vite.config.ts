import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
const API = process.env.VIDEO_STUDIO_PROXY || 'http://127.0.0.1:4183';
const proxy = Object.fromEntries(['/api','/projects','/components','/styles','/lib','/sfx','/vendor'].map(route => [route,{
  target: API, changeOrigin:true, ws:route==='/api',
  configure: (p: any) => {
    const fix=(req: any)=>req.setHeader('Origin',API);
    p.on('proxyReq',fix);p.on('proxyReqWs',fix);
  }
}]));
export default defineConfig({root:resolve(__dirname),plugins:[react(),tailwindcss()],base:'/',server:{host:'127.0.0.1',port:5173,proxy},build:{outDir:resolve(__dirname,'../studio/dist'),emptyOutDir:true,assetsDir:'app-assets',sourcemap:false}});
