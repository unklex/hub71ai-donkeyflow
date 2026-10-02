import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function gitCommit(){const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Build requires a valid Git commit SHA.');return commit}
