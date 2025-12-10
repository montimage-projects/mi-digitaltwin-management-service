import{c as b,ag as l,ah as r}from"./index-By_q5TPe.js";/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=b("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=b("Play",[["polygon",{points:"6 3 20 12 6 21 6 3",key:"1oa8hb"}]]),h=l()(r((e,s)=>({tabs:[],activeTabId:null,openTab:a=>{const{tabs:i}=s(),t=i.find(n=>n.type===a.type&&n.scenarioId===a.scenarioId);if(t){e({activeTabId:t.id});return}const d={...a,id:`${a.type}-${a.scenarioId}-${Date.now()}`};e({tabs:[...i,d],activeTabId:d.id})},closeTab:a=>{const{tabs:i,activeTabId:t}=s(),d=i.findIndex(c=>c.id===a),n=i.filter(c=>c.id!==a);let o=t;if(t===a)if(n.length>0){const c=Math.min(d,n.length-1);o=n[c].id}else o=null;e({tabs:n,activeTabId:o})},setActiveTab:a=>{e({activeTabId:a})},updateTab:(a,i)=>{e({tabs:s().tabs.map(t=>t.id===a?{...t,...i}:t)})},closeAllTabs:()=>{e({tabs:[],activeTabId:null})}}),{name:"intact-workspace",partialize:e=>({tabs:e.tabs.map(s=>({...s,isDirty:!1})),activeTabId:e.activeTabId})}));export{T as F,I as P,h as u};
