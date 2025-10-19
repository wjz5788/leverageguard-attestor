#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const command = args[0] ?? '';

if (command !== 'build') {
  console.error('[stub] Only "vite build" is supported in this environment.');
  process.exit(command === '' ? 1 : 0);
}

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const indexSrc = path.join(projectRoot, 'index.html');
const indexDest = path.join(distDir, 'index.html');
fs.copyFileSync(indexSrc, indexDest);

const publicSrc = path.join(projectRoot, 'public');
if (fs.existsSync(publicSrc)) {
  const publicDest = path.join(distDir, 'public');
  fs.rmSync(publicDest, { recursive: true, force: true });
  copyDir(publicSrc, publicDest);
}

console.log('[stub] Static assets copied to dist/.');

function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
