export class ApiError extends Error {status:number;constructor(message:string,status=422){super(message);this.status=status}}
export function requireValue(value:unknown,message:string,status=422):asserts value {if(!value)throw new ApiError(message,status)}
export const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
export async function readJson(request:Request,limit=16*1024*1024):Promise<Record<string,unknown>>{
 requireValue(request.headers.get('content-type')?.includes('application/json'),'Send JSON.');
 requireValue(Number(request.headers.get('content-length'))<=limit,'Request is too large.',413);
 const reader=request.body?.getReader();requireValue(reader,'Provide a JSON body.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new ApiError('Request is too large.',413)}chunks.push(value)}
 let value:unknown;try{value=JSON.parse(await new Blob(chunks as BlobPart[]).text())}catch{throw new ApiError('Invalid JSON.')}
 requireValue(isObject(value),'Expected a JSON object.');return value;
}
export async function apiHandler(action:()=>Promise<Response>):Promise<Response>{
 try{return await action()}catch(error){return Response.json({detail:error instanceof ApiError?error.message:'The service could not complete the request. Please retry.'},{status:error instanceof ApiError?error.status:502})}
}
export async function hash(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('')}
