const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webRoot = path.join(projectRoot, 'mobile', 'www');

fs.rmSync(webRoot, { recursive: true, force: true });
fs.mkdirSync(webRoot, { recursive: true });

for (const directory of ['UI', 'js']) {
  fs.cpSync(path.join(projectRoot, directory), path.join(webRoot, directory), { recursive: true });
}

const bibleAssetDirectories = ['app_assets/bibles', 'assets/bibles'];
const bundledBibleFiles = [];
bibleAssetDirectories.forEach((directory) => {
  const sourceDirectory = path.join(projectRoot, directory);
  if (!fs.existsSync(sourceDirectory)) return;
  fs.cpSync(sourceDirectory, path.join(webRoot, directory), { recursive: true });
  fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.xml')
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => bundledBibleFiles.push({ directory, name: entry.name }));
});
fs.writeFileSync(path.join(webRoot, 'bundled-bibles.json'), JSON.stringify(bundledBibleFiles, null, 2), 'utf8');

const bundledLogoSource = path.join(projectRoot, 'app_assets/logo/ACI_Logo.png');
if (fs.existsSync(bundledLogoSource)) {
  const bundledLogoDirectory = path.join(webRoot, 'app_assets/logo');
  fs.mkdirSync(bundledLogoDirectory, { recursive: true });
  fs.copyFileSync(bundledLogoSource, path.join(bundledLogoDirectory, 'ACI_Logo.png'));
}

const qrCodeBuildDirectory = path.join(webRoot, 'node_modules', 'qrcode-generator', 'dist');
fs.mkdirSync(qrCodeBuildDirectory, { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js'),
  path.join(qrCodeBuildDirectory, 'qrcode.js')
);

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