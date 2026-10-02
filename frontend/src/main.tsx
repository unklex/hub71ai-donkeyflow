import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,Package,Layers,Leaf,Upload,Film,FileImage,Check,ChevronLeft,MapPin,Palette,Image as ImageIcon,Sofa,RefreshCw,CheckCircle2} from 'lucide-react';
import './styles.css';
import {FloorPlan,PlanPicker,RoomEditor} from './PlanEditor';
import type {PlanResult as Plan} from '../../shared/plan';
import type {Category} from '../../shared/catalog';
import {BundleEditor,NeedsChecklist,Moodboard,defaultNeeds,type Bundle} from './BundleEditor';
import {extractFrames,cropItems} from './video';
import {cashOffer,type DetectedItem,type Frame} from '../../shared/sell';
type Style={tags:string[];palette:string[];summary:string;avoid:string[]};
type Detected=DetectedItem;
const furnishSteps=['Plan & brief','Rooms','What you need','Bundle','Order'];
const sellSteps=['Upload','What we found','Your lot'];
const money=(n:number)=>new Intl.NumberFormat('en-AE',{style:'currency',currency:'AED',maximumFractionDigits:0}).format(n);
async function api<T>(path:string,body?:object|FormData,signal?:AbortSignal):Promise<T>{
 const form=body instanceof FormData;
 const response=await fetch(path,body?{method:'POST',headers:form?undefined:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body),signal}:{signal});
 const result=await response.json();
 if(!response.ok)throw new Error(result.detail||'Could not load the demo. Please try again.');
 return result;
}
function App(){
 const [mode,setMode]=useState<'furnish'|'sell'|null>(null),[step,setStep]=useState(0),[tab,setTab]=useState<'Plan'|'Moodboard'|'Render'>('Plan');
 const [plan,setPlan]=useState<Plan|null>(null),[style,setStyle]=useState<Style|null>(null),[bundle,setBundle]=useState<Bundle|null>(null),[items,setItems]=useState<Detected[]>([]);
 const [brief,setBrief]=useState('A calm, comfortable home. Natural wood, soft fabrics, and a little colour.'),[needs,setNeeds]=useState<Category[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[health,setHealth]=useState(false),[render,setRender]=useState<string|null>(null),[budget,setBudget]=useState(3000),[lotReady,setLotReady]=useState(false);
 const [pins,setPins]=useState<Partial<Record<Category,string>>>({});
 const [lotMode,setLotMode]=useState<'move_out_lot'|'instant_cash'>('move_out_lot'),[publishedId,setPublishedId]=useState(''),[renderBusy,setRenderBusy]=useState(false),[renderError,setRenderError]=useState('');
 const sellVersion=useRef(0),renderVersion=useRef(0);
 const [videoFrames,setVideoFrames]=useState<Frame[]>([]);
 const requestVersion=useRef(0),lastBundleRequest=useRef('');
 const [building,setBuilding]=useState(''),[date,setDate]=useState('');
 const steps=mode==='sell'?sellSteps:furnishSteps;
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:'Something went wrong.')}finally{setBusy(false)}}
 useEffect(()=>{api<{status:string}>('/api/health').then(h=>setHealth(h.status==='ok')).catch(()=>setHealth(false))},[]);
 function choose(value:'furnish'|'sell'){sellVersion.current++;setMode(value);setStep(0);setMessage('');setError('');window.scrollTo({top:0,behavior:'instant'})}
 async function analyse(body:object|FormData){await run(async()=>{const result=await api<Plan>('/api/plan',body);setPlan(result);setNeeds(defaultNeeds(result));setPins({});setBundle(null);setStep(1);setTab('Plan');setMessage(`Plan analysed with ${result.model}${result.cached?' · saved result':''}. Review dimensions before continuing.`)})}
 async function upload(file:File,kind:'plan'|'sell'){await run(async()=>{
  if(kind==='sell'){
   const version=++sellVersion.current;setMessage('Reading your video…');
   const frames=await extractFrames(file,(done,total)=>{if(version===sellVersion.current)setMessage(`Extracting frame ${done} of ${total}…`)});
   if(version!==sellVersion.current)return;setVideoFrames(frames);setMessage(`Detecting furniture in ${frames.length} frames…`);
   const result=await api<{items:Detected[]}>('/api/sell/detect',{frames});
   if(version!==sellVersion.current)return;
   const cropped=await cropItems(result.items,frames);if(version!==sellVersion.current)return;
   setItems(cropped);setLotReady(false);setPublishedId('');setStep(1);setMessage(cropped.length?`Found ${cropped.length} pieces. Review the estimated sizes, condition and prices.`:'No movable furniture or appliances found. Try a clearer walkthrough.');
  }else{const data=new FormData();data.append('file',file);setPlan(await api<Plan>('/api/plan',data))}
 })}
 function uploadButton(label:string,accept:string,kind:'plan'|'sell',Icon:typeof Upload){return <label className="upload-button"><Icon size={18}/><span>{label}</span><input type="file" accept={accept} disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,kind);e.target.value=''}}/></label>}
 function bundleInput(){return {rooms:plan?.rooms,needed_categories:needs,budget_aed:budget,style,pins}}
 async function loadBundle(){await run(async()=>{const input=bundleInput();const version=++requestVersion.current;const result=await api<Bundle>('/api/bundle',input);if(version!==requestVersion.current)return;lastBundleRequest.current=JSON.stringify(input);setBundle(result);setStep(3);setTab('Plan')})}
 useEffect(()=>{
  if(mode!=='furnish'||step!==3||!plan)return;
  const input={rooms:plan.rooms,needed_categories:needs,budget_aed:budget,style,pins};const key=JSON.stringify(input);
  if(lastBundleRequest.current===key)return;
  const controller=new AbortController();const version=++requestVersion.current;setBusy(true);setError('');
  const timer=window.setTimeout(()=>{void api<Bundle>('/api/bundle',input,controller.signal).then(result=>{if(version===requestVersion.current){setBundle(result);lastBundleRequest.current=key}}).catch(e=>{if(!controller.signal.aborted&&version===requestVersion.current)setError(e instanceof Error?e.message:'Could not update bundle.')}).finally(()=>{if(version===requestVersion.current)setBusy(false)})},400);
  return()=>{window.clearTimeout(timer);controller.abort();if(version===requestVersion.current)setBusy(false)};
 },[mode,step,plan,needs,budget,style,pins]);
 async function bundleAction(action:object){let failure:unknown;await run(async()=>{const version=++requestVersion.current;try{const result=await api<Bundle>('/api/bundle',{...bundleInput(),action});if(version!==requestVersion.current)return;setBundle(result);setNeeds(result.needed_categories);setPins(result.pins);lastBundleRequest.current=JSON.stringify({rooms:plan?.rooms,needed_categories:result.needed_categories,budget_aed:budget,style,pins:result.pins})}catch(e){failure=e;throw e}});if(failure)throw failure}
 function removeCategory(category:Category){setPins(old=>({...old,[category]:'remove'}))}
 function addCategory(category:Category){setNeeds(old=>old.includes(category)?old:[...old,category]);setPins(old=>{const next={...old};delete next[category];return next})}
 async function next(){if(mode==='furnish'&&step===2){await loadBundle();return}setStep(Math.min(step+1,steps.length-1))}
 const livingRoom=plan?.rooms.find(r=>r.furnish&&/living|lounge/i.test(r.type+' '+r.name)&&bundle?.items.some(i=>i.placement.room_id===r.id));
 useEffect(()=>{renderVersion.current++;setRender(null);setRenderError('');setRenderBusy(false)},[bundle,plan,style]);
 async function loadRender(){
  if(!bundle||!livingRoom)return;const version=++renderVersion.current;setRenderBusy(true);setRenderError('');
  try{const result=await api<{image_url:string}>('/api/render',{bundle,room:livingRoom,style});if(version===renderVersion.current)setRender(result.image_url)}catch(e){if(version===renderVersion.current)setRenderError(e instanceof Error?e.message:'Could not render the room.')}finally{if(version===renderVersion.current)setRenderBusy(false)}
 }
 function editItem(id:string,patch:Partial<Detected>){setItems(old=>old.map(i=>i.id===id?{...i,...patch}:i));setLotReady(false);setPublishedId('')}
 async function publish(){await run(async()=>{const result=await api<{id:string}>('/api/sell/publish',{mode:lotMode,items:items.filter(i=>i.include)});setPublishedId(result.id);setLotReady(true);setMessage('Your lot has been published.')})}

 const total=items.filter(i=>i.include).reduce((sum,i)=>sum+i.suggested_price_aed,0);
 return <div className="app">
  <header className="header"><button className="brand" onClick={()=>{sellVersion.current++;setMode(null);setError('')}} aria-label="DonkeyFlow home"><span className="brand-mark"><Layers size={22}/></span>donkey<span>flow</span><span className="period">.</span></button><div className="header-meta"><span className="place"><MapPin size={14}/>Abu Dhabi</span><span className="demo-badge">VIDEO SELL & ROOM RENDER</span></div></header>
  {!mode?<main className="landing">
   <div className="landing-title"><p className="eyebrow">A NEW HOME FOR GOOD FURNITURE</p><h1>Your next move,<br/><span>a little lighter.</span></h1><p>Moving in or moving on? Let’s start with your home.</p></div>
   <div className="choice-grid">
    <button className="choice furnish-choice" onClick={()=>choose('furnish')}><div className="choice-image"><img src="/room.jpeg" alt="Bright contemporary living room with a blue sofa and natural wood flooring"/></div><div className="choice-body"><span className="choice-icon"><Home size={24}/></span><p className="eyebrow">MOVING IN</p><h2>Furnish my home</h2><p>Your space. Your style. Furniture with a second story.</p><span className="choice-cta">Start with your space <PlusSign/></span></div></button>
    <button className="choice sell-choice" onClick={()=>choose('sell')}><div className="choice-image"><img src="/room.jpeg" alt="Comfortable furniture ready for a new chapter"/></div><div className="choice-body"><span className="choice-icon"><Package size={24}/></span><p className="eyebrow">MOVING ON</p><h2>Sell everything<br className="desktop-break"/> from my home</h2><p>One walkthrough. One lot. A simpler goodbye.</p><span className="choice-cta">Start with your furniture <PlusSign/></span></div></button>
   </div>
   <div className="landing-foot"><span><Leaf size={17}/>Good pieces deserve another home.</span><span>Video furniture detection · A room preview for your next move</span></div>
  </main>:<main className="workspace-page">
   <div className="workspace-heading"><div><button className="home-link" onClick={()=>setMode(null)}><ChevronLeft size={15}/>Choose your move</button><h1>{mode==='furnish'?'Make room for your new life.':'A next chapter for your furniture.'}</h1></div><div className="mode-switch" role="group" aria-label="Choose flow"><button aria-pressed={mode==='furnish'} onClick={()=>choose('furnish')}><Home size={16}/>Furnish my home</button><button aria-pressed={mode==='sell'} onClick={()=>choose('sell')}><Package size={16}/>Sell everything</button></div></div>
   <nav className="stepbar" aria-label="Progress">{steps.map((name,i)=><button key={name} onClick={()=>{setStep(i);setMessage('');setError('')}} className={i===step?'active':i<step?'complete':''} aria-current={i===step?'step':undefined}><span className="step-number">{i<step?<Check size={14}/>:String(i+1).padStart(2,'0')}</span>{name}</button>)}</nav>
   <div className="workspace">
    <section className="canvas-panel" aria-label="Visual preview">
     <div className="canvas-toolbar"><div className="tabs" role="tablist" aria-label="Canvas view">{(['Plan','Moodboard','Render'] as const).map((name,i)=><button key={name} id={'tab-'+name} role="tab" aria-selected={tab===name} aria-controls="canvas-content" tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const next=(i+(e.key==='ArrowRight'?1:2))%3;const name=(['Plan','Moodboard','Render'] as const)[next];setTab(name);document.getElementById('tab-'+name)?.focus()}}}>{name==='Plan'?<Home size={15}/>:name==='Moodboard'?<Palette size={15}/>:<ImageIcon size={15}/>} {name}</button>)}</div><span className="canvas-tag">{plan ? "METRES" : "PLAN"}</span></div>
     <div className={'canvas-body '+(tab==='Moodboard'?'moodboard':'')} role="tabpanel" id="canvas-content" aria-labelledby={'tab-'+tab}>
      {tab==='Plan'&&(mode==='furnish'?(plan?<FloorPlan plan={plan} furniture={bundle?.items??[]}/>:<div className="empty"><Home size={42}/><h3>{busy?'Analysing floor plan…':'Choose or upload a floor plan'}</h3></div>):videoFrames.length?<div className="video-frame-grid" aria-label="Sampled video frames">{videoFrames.map(f=><figure key={f.seen_at_s}><img src={f.image_url} alt={`Walkthrough frame at ${f.seen_at_s} seconds`}/><figcaption>{f.seen_at_s}s</figcaption></figure>)}</div>:<div className="sell-overview"><Package size={54} strokeWidth={1.3}/><p className="eyebrow">ONE HOME. ONE LOT.</p><h2>Less moving.<br/>More moving on.</h2><p>Bring your pieces together<br/>for their next home.</p>{items.length>0&&<div className="sell-stats"><span><strong>{items.filter(i=>i.include).length}</strong>included pieces</span><span><strong>{money(total)}</strong>lot value</span></div>}</div>)}
      {tab==='Moodboard'&&<Moodboard bundle={bundle} palette={style?.palette??['#e3ddd0','#23877d','#8ca6a3']} summary={style?.summary??'Natural textures, simple shapes and a little colour.'}/>}
      {tab==='Render'&&<div className="empty render-preview" aria-busy={renderBusy}>{renderBusy?<div role="status"><span className="render-spinner"/><h3>Rendering your living room…</h3><p>This may take a minute.</p></div>:render?<img className="render-image" src={render} alt="AI-generated living room with your selected furniture" onError={()=>{setRender(null);setRenderError('The render image could not be loaded. Please retry.')}}/>:<><ImageIcon size={42}/><h3>Your room, reimagined.</h3><p>{livingRoom?'Preview your selected living-room furniture.':'Build a bundle with living-room furniture to preview it.'}</p></>}<button className="secondary" disabled={busy||renderBusy||!livingRoom} onClick={()=>void loadRender()}>{render?'View room render':'Render my living room'}</button>{renderError&&<p className="error" role="alert">{renderError}</p>}</div>}
     </div>
     <div className="plan-caption"><div><strong>{tab==='Moodboard'?'Materials & colour':tab==='Render'?'Room preview':mode==='furnish'?plan?.property_kind??'Your space':'Your move-out overview'}</strong><span>{tab==='Plan'&&mode==='furnish'?`${plan?.total_area_sqm??'—'} m² · ${plan?.model??'Select a plan'}`:tab==='Render'?'AI visualisation · confirm measurements':mode==='sell'?'Your selected furniture':'Furniture inspiration'}</span></div>{tab==='Plan'&&mode==='furnish'&&<span className="scale">METRES</span>}</div>
     <div className="canvas-footer"><Leaf size={15}/>A second home for furniture. A lighter footprint.</div>
    </section>
    <section className="control-panel" aria-label={steps[step]}>
     <div className="panel-heading"><p className="eyebrow">STEP {String(step+1).padStart(2,'0')} / {String(steps.length).padStart(2,'0')}</p><h2>{steps[step]}</h2><p>{mode==='furnish'?['Start with your space. We’ll help fill it.','Get to know each room.','Choose the essentials for your new home.','A first look at your furniture bundle.','Everything together, in one delivery.'][step]:['A short walkthrough is a good start.','Review your detected furniture and prices.','Bring your pieces together in one lot.'][step]}</p></div>
     <div className="controls">
      {mode==='furnish'&&step===0&&<><PlanPicker busy={busy} onAnalyse={analyse}/><label className="field">What feels like home?<textarea rows={3} value={brief} onChange={e=>setBrief(e.target.value)}/></label><button className="text-button" disabled={busy} onClick={()=>void run(async()=>{setStyle((await api<{style:Style}>('/api/intent',{text:brief})).style);setTab('Moodboard');setMessage('Sample style loaded. Your brief is not analysed in P1.')})}><Palette size={15}/>Preview style</button>{style&&<div className="style-tags">{style.tags.map(t=><span key={t}>{t}</span>)}</div>}<Notice>Upload each floor separately or crop both floors from one image. Missing dimensions need your input.</Notice></>}
      {mode==='furnish'&&step===1&&<>{plan&&<RoomEditor plan={plan} onChange={value=>{setPlan(value);setNeeds(defaultNeeds(value));setPins({});setBundle(null)}}/>}</>}
      {mode==='furnish'&&step===2&&<NeedsChecklist plan={plan} needs={needs} onChange={value=>{setNeeds(value);setPins(old=>Object.fromEntries(Object.entries(old).filter(([category])=>value.includes(category as Category))))}}/>}
      {mode==='furnish'&&step===3&&<>{bundle?<><BundleEditor bundle={bundle} needs={needs} budget={budget} busy={busy} onBudget={setBudget} onAction={bundleAction} onRemove={removeCategory} onAdd={addCategory} onMessage={setMessage}/><Notice>No items are reserved. Confirm listing availability and measurements before purchase.</Notice></>:<div className="empty small"><Sofa size={38}/><p>Build a bundle for your rooms.</p><button className="secondary" disabled={busy} onClick={()=>void loadBundle()}>Build bundle</button></div>}</>}
      {mode==='furnish'&&step===4&&<><div className="order-intro"><Package size={25}/><h3>One delivery. A fresh start.</h3><p>Delivery booking and building permits arrive in P6.</p></div><label className="field">Building or community<input value={building} onChange={e=>setBuilding(e.target.value)} placeholder="Your building name"/></label><label className="field">Preferred delivery date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="secondary" onClick={()=>setMessage('Order preview noted on this page. No booking or payment has been made.')}>Preview order</button><Notice>No order is placed in P1. Your entries are temporary and are not saved.</Notice></>}
      {mode==='sell'&&step===0&&<>{uploadButton('Upload walkthrough video','video/*','sell',Upload)}<div className="video-tips"><Film size={28}/><h3>A quick room-by-room walkthrough</h3><p>Keep the camera steady and show each piece clearly. We sample one frame every 3 seconds, up to 20 frames from the first minute.</p></div><Notice>Only sampled frames are sent to OpenAI for detection. Check estimated dimensions and condition before publishing.</Notice></>}
      {mode==='sell'&&step===1&&<>{items.length?<><div className="sell-items">{items.map(item=><article className="sell-item" key={item.id}><label className="sell-include"><input type="checkbox" checked={item.include} onChange={e=>editItem(item.id,{include:e.target.checked})} aria-label={`Include ${item.title}`}/>{item.thumbnail_url&&<img src={item.thumbnail_url} alt={`Video crop of ${item.title}`}/>}</label><div><strong>{item.title}</strong><small>{item.category.replaceAll('_',' ')} · {item.condition.replaceAll('_',' ')} · {item.seen_at_s}s</small><small>≈ {item.width_cm} × {item.depth_cm} cm · retail {money(item.retail_aed)}</small><label className="sell-price">Price (AED)<input type="number" min="0" max="1000000" step="10" value={item.suggested_price_aed} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n<=1e6)editItem(item.id,{suggested_price_aed:n})}}/></label></div></article>)}</div><div className="total-row"><span>{items.filter(i=>i.include).length} included · lot total</span><strong>{money(total)}</strong></div><Notice>Prices use estimated retail × condition, rounded to AED 10. You can adjust them.</Notice></>:<div className="empty small"><Package size={38}/><p>No furniture detected yet.</p><button className="secondary" onClick={()=>setStep(0)}>Upload a video</button></div>}</>}
      {mode==='sell'&&step===2&&<><fieldset className="lot-options"><legend>How would you like to sell?</legend><label><input type="radio" name="lotMode" checked={lotMode==='move_out_lot'} onChange={()=>{setLotMode('move_out_lot');setLotReady(false)}}/><span>List as a move-out lot<strong>{money(total)}</strong></span></label><label><input type="radio" name="lotMode" checked={lotMode==='instant_cash'} onChange={()=>{setLotMode('instant_cash');setLotReady(false)}}/><span>Instant cash offer<strong>{money(cashOffer(total))}</strong><small>60% of your lot total</small></span></label></fieldset><div className="lot-card"><Package size={28}/><h3>{lotMode==='move_out_lot'?'One move-out lot':'Instant cash offer'}</h3>{items.filter(i=>i.include).map(i=><p key={i.id}>{i.title} · {money(i.suggested_price_aed)}</p>)}<strong>{money(lotMode==='move_out_lot'?total:cashOffer(total))}</strong><small>{items.filter(i=>i.include).length} included pieces</small></div><button className="primary" disabled={busy||!items.some(i=>i.include)||lotReady} onClick={()=>void publish()}>{lotReady?'Published':'Publish'}</button>{lotReady&&<div className="result" role="status"><CheckCircle2 size={22}/><span><strong>Lot published</strong><p>Saved reference: {publishedId}</p></span></div>}</>}
      {message&&<div className="feedback" role="status">{message}</div>}
      {error&&<div className="error" role="alert">{error}</div>}
     </div>
     <div className="panel-footer"><span>{busy?'Processing…':health?'API connected':'API unavailable'}</span><div>{step>0&&<button className="back" disabled={busy} onClick={()=>setStep(step-1)}>Back</button>}{step<steps.length-1&&<button className="primary" disabled={busy||(mode==='furnish'&&!plan)||(mode==='sell'&&!items.some(i=>i.include))} onClick={()=>void next()}>Continue</button>}</div></div>
    </section>
   </div>
   <footer className="footer"><span>DonkeyFlow · Made for your next move.</span><span>Vision plan analysis · Review sizes before furnishing.</span></footer>
  </main>}
 </div>;
}
function Notice({children}:{children:React.ReactNode}){return <div className="notice"><Leaf size={17}/><span>{children}</span></div>}
function PlusSign(){return <span className="choice-plus" aria-hidden="true">+</span>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
