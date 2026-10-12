const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webRoot = path.join(projectRoot, 'mobile', 'www');

fs.rmSync(webRoot, { recursive: true, force: true });
fs.mkdirSync(webRoot, { recursive: true });

for (const directory of ['UI', 'js']) {
  fs.cpSync(path.join(projectRoot, directory), path.join(webRoot, directory), { recursive: true });
}

const logoDirectory = path.join(webRoot, 'electron', 'resources');
fs.mkdirSync(logoDirectory, { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, 'electron', 'resources', 'Logo.svg'),
  path.join(logoDirectory, 'Logo.svg')
);

fs.writeFileSync(path.join(webRoot, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <title>Scripture Pod</title>
</head>
<body>
  <script>location.replace('UI/scripture-pod-panel.html' + location.search + location.hash);</script>
</body>
</html>
`, 'utf8');

console.log(`Prepared Capacitor web assets at ${path.relative(projectRoot, webRoot)}`);