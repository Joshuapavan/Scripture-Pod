const fs = require('node:fs/promises');
const path = require('node:path');

const BIBLE_ASSET_DIRECTORIES = ['app_assets/bibles', 'assets/bibles'];

async function listBundledBibleFiles(projectRoot) {
  const files = [];
  for (const directory of BIBLE_ASSET_DIRECTORIES) {
    let entries;
    try {
      entries = await fs.readdir(path.join(projectRoot, directory), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.xml')
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => files.push({ directory, name: entry.name }));
  }
  return files;
}

async function readBundledBibleFile(projectRoot, asset) {
  const directory = String(asset?.directory || '');
  const name = String(asset?.name || '');
  if (!BIBLE_ASSET_DIRECTORIES.includes(directory)) throw new Error('Invalid Bible asset directory');
  if (!name || name !== path.basename(name) || path.extname(name).toLowerCase() !== '.xml') {
    throw new Error('Invalid Bible asset filename');
  }

  const rootPath = path.resolve(projectRoot, directory);
  const realRoot = await fs.realpath(rootPath);
  const filePath = await fs.realpath(path.join(rootPath, name));
  if (!filePath.startsWith(`${realRoot}${path.sep}`)) throw new Error('Bible asset path is outside the asset directory');
  return { name, contents: await fs.readFile(filePath, 'utf8') };
}

async function readBundledChurchLogo(projectRoot) {
  const rootPath = path.resolve(projectRoot, 'app_assets/logo');
  const realRoot = await fs.realpath(rootPath);
  const filePath = await fs.realpath(path.join(realRoot, 'ACI_Logo.png'));
  if (!filePath.startsWith(`${realRoot}${path.sep}`)) throw new Error('Bundled logo path is outside the asset directory');
  return {
    name: 'ACI_Logo.png',
    contents: (await fs.readFile(filePath)).toString('base64')
  };
}

module.exports = { BIBLE_ASSET_DIRECTORIES, listBundledBibleFiles, readBundledBibleFile, readBundledChurchLogo };