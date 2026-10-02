import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {build} from 'vite';
const assets:Record<string,{type:string;base64:string}>={};
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
async function walk(directory:string,prefix=''){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const relative=prefix+'/'+entry.name;
  if(entry.isDirectory())await walk(join(directory,entry.name),relative);
  else assets[relative]={type:mime[extname(relative)]||'application/octet-stream',base64:(await readFile(join(directory,entry.name))).toString('base64')};
 }
}
await walk('frontend/dist');
assets['/plans.json']={type:'application/json',base64:(await readFile('data/plans.json')).toString('base64')};
assets['/api/media/render.png']={type:'image/png',base64:(await readFile('data/cache/render.png')).toString('base64')};
await mkdir('.sites-runtime',{recursive:true});
await writeFile('.sites-runtime/entry.ts',"import {createWorker} from '../worker/index';\nexport default createWorker("+JSON.stringify(assets)+");\n");
await build({configFile:false,build:{outDir:'dist/server',emptyOutDir:true,lib:{entry:resolve('.sites-runtime/entry.ts'),formats:['es'],fileName:()=>'index.js'},minify:true}});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker-compatible TypeScript application.');
