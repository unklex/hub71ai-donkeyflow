import React,{useState} from 'react';
import plans from '../../data/plans.json';
import {checkPlan,type PlanResult,type Room} from '../../shared/plan';
type Crop={x:number;y:number;w:number;h:number};
type Source={url:string;image:HTMLImageElement;crop:Crop};
const full:Crop={x:0,y:0,w:100,h:100};
async function readPlan(file:File):Promise<Source>{
 if(file.size>24*1024*1024)throw new Error('Upload must be under 24 MB.');
 let url:string;
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
  try{const pdf=await task.promise;const page=await pdf.getPage(1);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(3,6000/Math.max(base.width,base.height))});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,viewport}).promise;url=canvas.toDataURL('image/png')}finally{await task.destroy()}
 }else{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPEG, WebP or PDF.');
  url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read image.'));reader.readAsDataURL(file)});
 }
 const image=new Image();image.src=url;await image.decode();return {url,image,crop:{...full}};
}
async function cropped(source:Source):Promise<Blob>{
 const {image,crop}=source,canvas=document.createElement('canvas');const x=image.naturalWidth*crop.x/100,y=image.naturalHeight*crop.y/100,w=image.naturalWidth*crop.w/100,h=image.naturalHeight*crop.h/100;
 canvas.width=Math.max(1,Math.round(w));canvas.height=Math.max(1,Math.round(h));canvas.getContext('2d')!.drawImage(image,x,y,w,h,0,0,canvas.width,canvas.height);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not crop image.')),'image/png'));
}
export function PlanPicker({busy,onAnalyse}:{busy:boolean;onAnalyse:(body:object|FormData)=>Promise<void>}){
 const [selected,setSelected]=useState(plans[0]?.id??''),[count,setCount]=useState(1),[sources,setSources]=useState<(Source|null)[]>([null,null]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const disabled=busy||loading;
 async function load(file:File,index:number){setError('');setLoading(true);try{const source=await readPlan(file);setSources(old=>old.map((s,i)=>i===index?source:s))}catch(e){setError(e instanceof Error?e.message:'Could not read file.')}finally{setLoading(false)}}
 function update(index:number,crop:Crop){setSources(old=>old.map((s,i)=>i===index&&s?{...s,crop}:s))}
 async function analyse(){setError('');setLoading(true);try{const form=new FormData();for(let i=0;i<count;i++){if(!sources[i])throw new Error(`Upload floor ${i+1}.`);form.append(`floor_${i}`,await cropped(sources[i]!),`floor-${i}.png`)}await onAnalyse(form)}catch(e){setError(e instanceof Error?e.message:'Analysis failed.')}finally{setLoading(false)}}
 return <div className="plan-picker"><label className="field">Choose a floor plan<select value={selected} disabled={disabled} onChange={e=>setSelected(e.target.value)}>{plans.map(p=><option key={p.id} value={p.id}>{p.community} · {p.bedrooms} bedrooms · {p.images.length} floor{p.images.length>1?'s':''}</option>)}</select></label><button className="secondary" disabled={disabled} onClick={()=>void onAnalyse({plan_id:selected})}>Analyse selected plan</button>
 <div className="divider"><span>or bring your own</span></div><label className="field">Floors<select value={count} disabled={disabled} onChange={e=>setCount(Number(e.target.value))}><option value={1}>1 floor</option><option value={2}>2 floors · upload or crop separately</option></select></label>
 {Array.from({length:count},(_,i)=><div className="floor-upload" key={i}><label className="upload-button"><span>{count===1?'Upload floor plan':`Upload floor ${i+1} plan`}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={disabled} onChange={e=>{const f=e.target.files?.[0];if(f)void load(f,i);e.target.value=''}}/></label>
 {i===1&&sources[0]&&<button className="text-button" disabled={disabled} onClick={()=>setSources(old=>[old[0],{...old[0]!,crop:{...full}}])}>Crop floor 2 from the same image</button>}
 {sources[i]&&<><CropPreview source={sources[i]!} onChange={crop=>update(i,crop)} disabled={disabled}/><button className="text-button" disabled={disabled} onClick={()=>update(i,{...full})}>Use full image</button></>}</div>)}
 <small>PNG, JPEG, WebP or first PDF page. Drag on the image to crop each floor; printed dimensions must stay visible.</small><button className="secondary" disabled={disabled||sources.slice(0,count).some(s=>!s)} onClick={()=>void analyse()}>{disabled?'Analysing…':'Analyse uploaded floors'}</button>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
function CropPreview({source,onChange,disabled}:{source:Source;onChange:(crop:Crop)=>void;disabled:boolean}){
 const [start,setStart]=useState<{x:number;y:number}|null>(null);
 function point(e:React.PointerEvent<HTMLDivElement>){const b=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-b.left)/b.width*100)),y:Math.max(0,Math.min(100,(e.clientY-b.top)/b.height*100))}}
 const c=source.crop;
 return <div className="crop-preview" aria-label="Drag to select the floor crop" onPointerDown={e=>{if(disabled)return;e.currentTarget.setPointerCapture(e.pointerId);setStart(point(e))}} onPointerMove={e=>{if(!start)return;const end=point(e);onChange({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.max(1,Math.abs(end.x-start.x)),h:Math.max(1,Math.abs(end.y-start.y))})}} onPointerUp={()=>setStart(null)} onPointerCancel={()=>setStart(null)}><img src={source.url} alt="Uploaded floor plan to crop" draggable={false}/><div className="crop-box" style={{left:`${c.x}%`,top:`${c.y}%`,width:`${c.w}%`,height:`${c.h}%`}}/></div>;
}
export function FloorPlan({plan}:{plan:PlanResult}){
 const conflicts=new Set(checkPlan(plan).filter(w=>w.message==='check layout').map(w=>w.room_id));
 return <div className="floor-previews">{Array.from({length:plan.floors},(_,floor)=>{
  const rooms=plan.rooms.filter(r=>r.floor===floor),placed=rooms.filter(r=>r.width_m!==null&&r.length_m!==null&&r.x_m!==null&&r.y_m!==null&&!conflicts.has(r.id));
  const width=Math.max(1,...placed.map(r=>r.x_m!+r.width_m!)),height=Math.max(1,...placed.map(r=>r.y_m!+r.length_m!));
  const unplaced=rooms.filter(r=>!placed.includes(r));
  return <section key={floor}><h3>Floor {floor+1}</h3>{placed.length>0&&<svg className="floorplan" viewBox={`-0.4 -0.4 ${width+.8} ${height+.8}`} role="img" aria-label={`Floor ${floor+1} rooms to scale in metres`}>{placed.map(r=><g key={r.id}><rect x={r.x_m!} y={r.y_m!} width={r.width_m!} height={r.length_m!} fill={r.furnish?'#fafffc':'#e6ece9'} stroke="#347e77" strokeWidth=".045"/><text x={r.x_m!+r.width_m!/2} y={r.y_m!+r.length_m!/2-.12} textAnchor="middle" fontSize=".2">{r.name}</text><text x={r.x_m!+r.width_m!/2} y={r.y_m!+r.length_m!/2+.2} textAnchor="middle" fontSize=".16">{r.width_m} × {r.length_m} m</text></g>)}</svg>}
  {unplaced.length>0&&<div className="unplaced-rooms"><small>Rooms awaiting size or placement</small><MeasuredRooms rooms={unplaced}/>{unplaced.filter(r=>r.width_m===null||r.length_m===null).map(r=><div key={r.id}><strong>{r.name}</strong><span>Enter size</span></div>)}</div>}</section>;
 })}</div>;
}
function MeasuredRooms({rooms}:{rooms:Room[]}){
 let x=0;
 const tiles=rooms.filter(r=>r.width_m!==null&&r.length_m!==null).map(r=>{const tile={r,x};x+=r.width_m!+.4;return tile});
 if(!tiles.length)return null;
 const height=Math.max(...tiles.map(t=>t.r.length_m!));
 return <><small>Measured rooms to scale · arranged for review, placement unverified</small><svg className="floorplan" viewBox={`-.2 -.2 ${x} ${height+.4}`} role="img" aria-label="Measured room sizes awaiting placement">{tiles.map(({r,x})=><g key={r.id}><rect x={x} y={0} width={r.width_m!} height={r.length_m!} fill={r.furnish?'#fafffc':'#e6ece9'} stroke="#347e77" strokeWidth=".04"/><text x={x+r.width_m!/2} y={r.length_m!/2-.12} textAnchor="middle" fontSize=".2">{r.name}</text><text x={x+r.width_m!/2} y={r.length_m!/2+.2} textAnchor="middle" fontSize=".16">{r.width_m} × {r.length_m} m</text></g>)}</svg></>;
}
export function RoomEditor({plan,onChange}:{plan:PlanResult;onChange:(plan:PlanResult)=>void}){
 const warnings=[...plan.warnings.filter(w=>w.message==='check layout'),...checkPlan(plan)];
 function edit(id:string,patch:Partial<Room>){onChange({...plan,rooms:plan.rooms.map(r=>r.id===id?{...r,...patch}:r)})}
 function row(r:Room){return <div key={r.id} className={`editable-room ${r.furnish?'':'excluded-room'}`}><div className="room-title"><strong>{r.name}</strong><small>Floor {r.floor+1} · {Math.round(r.confidence*100)}% confidence</small></div><div className="room-dimensions">{(['width_m','length_m'] as const).map(axis=><label key={axis} className={r[axis]===null?'unknown-size':''}>{axis==='width_m'?'Width (m)':'Length (m)'}<input type="number" min="0.01" step="any" value={r[axis]??''} placeholder="Enter size" onChange={e=>{const value=e.target.value===''?null:Number(e.target.value);edit(r.id,{[axis]:value!==null&&(!Number.isFinite(value)||value<=0)?null:value})}}/>{r[axis]===null&&<small>Enter size</small>}</label>)}</div><div className="room-options"><span>{r.width_m!==null&&r.length_m!==null?`${(r.width_m*r.length_m).toFixed(2)} m²`:'Size needed'}</span><label><input type="checkbox" checked={r.furnish} onChange={e=>edit(r.id,{furnish:e.target.checked})}/> Include furniture</label></div>{warnings.filter(w=>w.room_id===r.id).map((w,i)=><small key={i} className="size-warning" title={w.reason}>{w.message} · {w.reason}</small>)}</div>}
 return <><div className="room-list">{plan.rooms.filter(r=>r.furnish).map(row)}</div>{plan.rooms.some(r=>!r.furnish)&&<><h3 className="service-heading">Other spaces</h3><div className="room-list">{plan.rooms.filter(r=>!r.furnish).map(row)}</div></>}<small>Analysed with {plan.model}. Printed sizes are preserved; enter any missing sizes in metres.</small><details><summary>Printed dimension transcript</summary>{plan.dimension_labels.map((l,i)=><p key={i}>Floor {l.floor+1}: {l.text??'Unreadable'} {l.room_hint&&`(${l.room_hint})`}</p>)}</details></>;
}
