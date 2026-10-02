export type Room = { id:string; type:string; name:string; floor:number; width_m:number|null; length_m:number|null; x_m:number|null; y_m:number|null; confidence:number; furnish:boolean };
export type Plan = { property_kind:string; floors:number; bedrooms:number|null; dims_source:'printed'|'estimated'; total_area_sqm:number|null; rooms:Room[] };
export type DimensionLabel = { text:string|null; room_hint:string|null; floor:number; width_m:number|null; length_m:number|null };
export type Furniture = { room_id:string; width_m:number; length_m:number };
export type Warning = { room_id:string; message:'check size'|'check layout'; reason:string };
export type PlanResult = Plan & { model:string; image_hash:string; cached:boolean; dimension_labels:DimensionLabel[]; warnings:Warning[] };
export const excludedRoom = (room:Pick<Room,'type'|'name'>) => /\b(bath(?:room)?s?|wc|toilet|laundry|corridors?|hall(?:way)?s?|stairs?|staircase|balcon(?:y|ies)|parking|garage|carport|gardens?|pool|walk[ -]?in(?: closet| wardrobe)?s?|water[ -]?tanks?)\b/i.test(`${room.type.replaceAll('_',' ')} ${room.name}`);
export function checkPlan(plan:Plan, furniture:Furniture[]=[]):Warning[] {
 const warnings:Warning[]=[];
 for(const room of plan.rooms){
  const w=room.width_m,l=room.length_m;
  if(w===null||l===null)continue;
  if(/living|lounge/i.test(room.type+' '+room.name)&&w*l<12)warnings.push({room_id:room.id,message:'check size',reason:'Living room is under 12 m².'});
  for(const item of furniture.filter(f=>f.room_id===room.id)){
   if(!((item.width_m<=w&&item.length_m<=l)||(item.length_m<=w&&item.width_m<=l)))warnings.push({room_id:room.id,message:'check size',reason:'Room is smaller than its furniture, including a rotated fit.'});
  }
  for(const other of plan.rooms){
   if(other===room)break;
   if(room.floor!==other.floor||room.x_m===null||room.y_m===null||other.x_m===null||other.y_m===null||other.width_m===null||other.length_m===null)continue;
   if(Math.min(room.x_m+w,other.x_m+other.width_m)-Math.max(room.x_m,other.x_m)>0.001&&Math.min(room.y_m+l,other.y_m+other.length_m)-Math.max(room.y_m,other.y_m)>0.001){
    for(const r of [room,other])warnings.push({room_id:r.id,message:'check layout',reason:'Rooms overlap on the same floor. Verify placement.'});
   }
  }
 }
 return warnings;
}

export function defaultRoomSize(room:Pick<Room,'type'|'name'>):[number,number]|null {
 const value=(room.type+' '+room.name).replace(/[^a-z0-9]+/gi,' ');
 return /\b(master|main bed(?:room)?|m bedroom)\b/i.test(value)?[4.5,4]:/bedroom/i.test(value)?[4,3.5]:/living|lounge|studio/i.test(value)?[6,4.5]:/dining/i.test(value)?[4,3.5]:/study|office/i.test(value)?[3,2.8]:/kitchen/i.test(value)?[3.5,3]:/maid/i.test(value)?[2.5,2.2]:null;
}
