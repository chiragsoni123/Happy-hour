/**
 * Web build for the iPhone. `expo export --platform web` with `output: "single"` uses
 * Expo's own HTML template, so the tags that make Safari's "Add to Home Screen" open the
 * app full-screen with its own icon are patched in afterwards.
 *
 *   node scripts/build-web.js      →  dist/  (drag the folder onto Netlify, or deploy it)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
execSync('npx expo export --platform web --output-dir dist', { cwd: root, stdio: 'inherit' });

const head = `
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Happy Hour" />
    <meta name="theme-color" content="#070B08" />
    <style>html,body{background:#070B08}</style>
  </head>`;

const index = path.join(dist, 'index.html');
let html = fs.readFileSync(index, 'utf8');
html = html.replace(/<meta name="viewport"[^>]*\/>\s*/, '').replace('</head>', head);
fs.writeFileSync(index, html);

// Single-page app: every route must serve index.html.
fs.writeFileSync(path.join(dist, '_redirects'), '/*  /index.html  200\n');

console.log('\nWeb build ready in dist/ — every route falls back to index.html.');
