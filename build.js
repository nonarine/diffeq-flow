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

  // Remove all individual module script tags
  html = html.replace(/<script[^>]*type="module"[^>]*src="src\/[^"]*"[^>]*><\/script>\s*/g, '');

  // Remove the service worker and dynamic main.js loading block
  html = html.replace(/<!-- Register Service Worker.*?<\/script>/s, '');

  // Add bundled script before closing body tag
  html = html.replace(
    '</body>',
    '    <script src="app.min.js"></script>\n</body>'
  );

  fs.writeFileSync(buildIndexPath, html);
  console.log('✓ index.html created in build/');

  // Copy CSS files (Phase 2 refactoring - modular CSS architecture)
  const srcUiPath = path.join(__dirname, 'src', 'ui');
  const buildSrcUiPath = path.join(buildDir, 'src', 'ui');

  // Create src/ui directory in build
  fs.mkdirSync(buildSrcUiPath, { recursive: true });

  // Copy floating-panels.css
  const floatingPanelsPath = path.join(srcUiPath, 'floating-panels.css');
  if (fs.existsSync(floatingPanelsPath)) {
    fs.copyFileSync(floatingPanelsPath, path.join(buildSrcUiPath, 'floating-panels.css'));
  }

  // Copy styles directory
  const stylesPath = path.join(srcUiPath, 'styles');
  const buildStylesPath = path.join(buildSrcUiPath, 'styles');
  if (fs.existsSync(stylesPath)) {
    fs.cpSync(stylesPath, buildStylesPath, { recursive: true });
  }

  console.log('✓ CSS files copied to build/src/ui/');

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
  console.log('   - build/src/ui/styles/ (modular CSS files)');
  console.log('   - build/src/ui/floating-panels.css');
  console.log('   - build/docs/ (documentation)');

}).catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
