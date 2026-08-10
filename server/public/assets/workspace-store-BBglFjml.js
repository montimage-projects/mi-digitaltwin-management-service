import{c as d,ah as b,ai as I,aj as p}from"./index-BzU2EaWB.js";/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=d("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=d("Play",[["polygon",{points:"6 3 20 12 6 21 6 3",key:"1oa8hb"}]]),T="montimage-workspace",r="intact-workspace",m={getItem:a=>{const t=localStorage.getItem(a);if(t!==null)return t;const e=localStorage.getItem(r);return e===null?null:(localStorage.setItem(a,e),localStorage.removeItem(r),e)},setItem:(a,t)=>localStorage.setItem(a,t),removeItem:a=>localStorage.removeItem(a)},y=b()(I((a,t)=>({tabs:[],activeTabId:null,openTab:e=>{const{tabs:s}=t(),o=s.find(c=>c.type===e.type&&c.scenarioId===e.scenarioId);if(o){a({activeTabId:o.id});return}const i={...e,id:`${e.type}-${e.scenarioId}-${Date.now()}`};a({tabs:[...s,i],activeTabId:i.id})},closeTab:e=>{const{tabs:s,activeTabId:o}=t(),i=s.findIndex(n=>n.id===e),c=s.filter(n=>n.id!==e);let l=o;if(o===e)if(c.length>0){const n=Math.min(i,c.length-1);l=c[n].id}else l=null;a({tabs:c,activeTabId:l})},setActiveTab:e=>{a({activeTabId:e})},updateTab:(e,s)=>{a({tabs:t().tabs.map(o=>o.id===e?{...o,...s}:o)})},closeAllTabs:()=>{a({tabs:[],activeTabId:null})}}),{name:T,storage:p(()=>m),partialize:a=>({tabs:a.tabs.map(t=>({...t,isDirty:!1})),activeTabId:a.activeTabId})}));export{v as F,g as P,y as u};
