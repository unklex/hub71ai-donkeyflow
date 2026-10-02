import {frameTimes,type Frame,type DetectedItem} from '../../shared/sell';
function waitFor(target:EventTarget,event:string,action?:()=>void):Promise<void>{return new Promise((resolve,reject)=>{
 const timer=window.setTimeout(()=>finish(new Error('Video could not be decoded. Try a browser-supported MP4.')),20000);
 function finish(error?:Error){clearTimeout(timer);target.removeEventListener(event,ready);target.removeEventListener('error',failed);error?reject(error):resolve()}
 function ready(){finish()}function failed(){finish(new Error('This video format could not be decoded. Try an MP4 video.'))}
 target.addEventListener(event,ready,{once:true});target.addEventListener('error',failed,{once:true});action?.();
})}
export async function extractFrames(file:File,onProgress:(done:number,total:number)=>void):Promise<Frame[]>{
 if(!file.type.startsWith('video/'))throw new Error('Choose a video file.');
 const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await waitFor(video,'loadeddata',()=>{video.src=url;video.load()});
  const times=frameTimes(video.duration),canvas=document.createElement('canvas');
  const scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');const frames:Frame[]=[];
  for(const time of times){
   if(Math.abs(video.currentTime-time)>0.001)await waitFor(video,'seeked',()=>{video.currentTime=time});
   ctx.drawImage(video,0,0,canvas.width,canvas.height);frames.push({seen_at_s:time,image_url:canvas.toDataURL('image/jpeg',0.75)});onProgress(frames.length,times.length);
  }
  return frames;
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
export async function cropItems(items:DetectedItem[],frames:Frame[]):Promise<DetectedItem[]>{
 return Promise.all(items.map(async item=>{
  const frame=frames.find(f=>f.seen_at_s===item.seen_at_s);if(!frame)throw new Error('Detection referenced a missing frame.');
  const img=new Image();await waitFor(img,'load',()=>{img.src=frame.image_url});
  const b=item.box,width=Math.max(1,b.width*img.naturalWidth),height=Math.max(1,b.height*img.naturalHeight),canvas=document.createElement('canvas');
  const scale=Math.min(1,256/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
  ctx.drawImage(img,b.x*img.naturalWidth,b.y*img.naturalHeight,width,height,0,0,canvas.width,canvas.height);
  return {...item,thumbnail_url:canvas.toDataURL('image/jpeg',0.7)};
 }));
}
