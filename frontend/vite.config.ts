import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {gitCommit} from '../scripts/git-commit.ts';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),define:{__BUILD_COMMIT__:JSON.stringify(gitCommit())},plugins:[react(),tailwindcss()],build:{outDir:'dist',emptyOutDir:true}});
