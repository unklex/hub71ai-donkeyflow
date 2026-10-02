export const conditionFactors = {like_new:0.45,good:0.35,fair:0.22} as const;
export type Condition = keyof typeof conditionFactors;
export type Frame = {seen_at_s:number;image_url:string};
export type DetectedItem = {id:string;category:string;title:string;seen_at_s:number;width_cm:number;depth_cm:number;condition:Condition;retail_aed:number;suggested_price_aed:number;include:boolean;box:{x:number;y:number;width:number;height:number};thumbnail_url?:string};
export const suggestedPrice = (retail:number,condition:Condition) => Math.round(retail*conditionFactors[condition]/10)*10;
export const cashOffer = (total:number) => Math.round(total*0.6*100)/100;
export function frameTimes(duration:number):number[]{
 if(!Number.isFinite(duration)||duration<=0)throw new Error('This video has no readable duration.');
 return Array.from({length:Math.min(20,Math.ceil(duration/3))},(_,i)=>i*3);
}
