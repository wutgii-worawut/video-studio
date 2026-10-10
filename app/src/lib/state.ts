import {create} from 'zustand';
import type {Project,FileEntry,Scene,Composition,DeletedEntry} from './api';
export type Category='source'|'assets'|'brand'|'documents'|'fx'|'models'|'output'|'trash';
export type InspectorTab='file'|'scenes'|'composition'|'project';
interface StudioState {
 projects:Project[];project:string;category:Category;files:FileEntry[];trash:DeletedEntry[];
 selected:FileEntry|null;inspector:InspectorTab;scenes:Scene[];duration:number;time:number;
 playing:boolean;mute:boolean;volume:number;composition:Composition|null;etag:string;
 terminalTab:'powershell'|'tasks';workspaceMode:'normal'|'preview'|'inspector';search:string;previewRevision:number;
 set:(data:Partial<StudioState>)=>void;
 switchProject:(name:string)=>void;
 select:(file:FileEntry|null)=>void;
}
export const useStudio=create<StudioState>((set)=>({
 projects:[],project:'',category:'brand',files:[],trash:[],selected:null,inspector:'file',
 scenes:[],duration:15,time:0,playing:false,mute:false,volume:1,composition:null,etag:'',
 terminalTab:'powershell',workspaceMode:'normal',search:'',previewRevision:0,
 set:(data)=>set(data),
 switchProject:(name)=>set({project:name,time:0,playing:false,scenes:[],files:[],selected:null,composition:null,etag:'',workspaceMode:'normal'}),
 select:(selected)=>set({selected,inspector:'file'})
}));
