import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'frontend',plugins:[react()],build:{outDir:'../dist-local',emptyOutDir:true},css:{postcss:{plugins:[]}}});
