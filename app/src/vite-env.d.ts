/// <reference types="vite/client" />
interface Window{videoStudioDesktop?:{platform:string;version:string;setTitle:(s:string)=>void;getWorkspace:()=>Promise<string>;readClipboard:()=>Promise<string>;writeClipboard:(text:string)=>Promise<boolean>;setWorkspace:(path:string)=>Promise<boolean>};}
