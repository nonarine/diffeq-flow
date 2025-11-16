#!/usr/bin/env node

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean build directory
const buildDir = path.join(__dirname, 'build');
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// Build JavaScript bundle
esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: 'build/app.min.js',
  format: 'iife', // Immediately Invoked Function Expression (for browsers)
  globalName: 'DeRender', // Optional: expose as global if needed
  target: ['es2020'],
  loader: {
    '.js': 'js'
  }
}).then(() => {
  console.log('✓ JavaScript bundled successfully');

  // Copy index.html and modify script reference
  const indexPath = path.join(__dirname, 'index.html');
  const buildIndexPath = path.join(buildDir, 'index.html');

  let html = fs.readFileSync(indexPath, 'utf8');

  // Replace all script tags with single bundled script
  // Remove all individual script tags
  html = html.replace(/<script[^>]*src="src\/[^"]*"[^>]*><\/script>\s*/g, '');

  // Add bundled script before closing body tag
  html = html.replace(
    '</body>',
    '    <script src="app.min.js"></script>\n</body>'
  );

  fs.writeFileSync(buildIndexPath, html);
  console.log('✓ index.html created in build/');

  // Copy docs directory
  const docsPath = path.join(__dirname, 'docs');
  const buildDocsPath = path.join(buildDir, 'docs');
  if (fs.existsSync(docsPath)) {
    fs.cpSync(docsPath, buildDocsPath, { recursive: true });
    console.log('✓ docs/ copied to build/');
  }

  console.log('\n✅ Build complete! Output in build/ directory');
  console.log('   - build/app.min.js (bundled & minified)');
  console.log('   - build/app.min.js.map (source maps)');
  console.log('   - build/index.html (updated references)');
  console.log('   - build/docs/ (documentation)');

}).catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
