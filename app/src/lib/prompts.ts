import type {Page} from './state';
// Quick prompts for the terminal Insert bar (spec §3). Text is inserted at the cursor; the user presses Enter.
export const QUICK_PROMPTS:Record<Page,{label:string;text:(project:string)=>string}[]>={
 director:[
  {label:'/make-video',text:p=>'/make-video '+p},
  {label:'check layout',text:()=>'สั่ง check แล้วแก้สิ่งที่ล้นจอ'},
  {label:'draft render',text:()=>'เรนเดอร์ร่าง video 1 2'},
 ],
 code:[{label:'explain this file',text:()=>'อธิบายไฟล์นี้สั้น ๆ'}],
 library:[{label:'use in a scene',text:()=>'ใช้ไฟล์นี้ในฉากที่เหมาะสม'}],
 render:[
  {label:'fix check errors',text:()=>'แก้ทุกข้อที่ check แจ้ง'},
  {label:'final render',text:()=>'เรนเดอร์จริง video 8 2'},
 ],
 projects:[{label:'/make-video new',text:()=>'/make-video '}],
};
