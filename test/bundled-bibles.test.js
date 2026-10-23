const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { listBundledBibleFiles, readBundledBibleFile, readBundledChurchLogo } = require('../src/main/bundled-bibles');

test('lists and reads XML files from the Bible asset folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scripture-pod-bibles-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'assets/bibles'), { recursive: true });
  await fs.writeFile(path.join(root, 'assets/bibles/Tamil.xml'), '<XMLBIBLE/>');
  await fs.writeFile(path.join(root, 'assets/bibles/English.XML'), '<XMLBIBLE/>');
  await fs.writeFile(path.join(root, 'assets/bibles/readme.txt'), 'ignored');

  const files = await listBundledBibleFiles(root);
  assert.deepEqual(files, [
    { directory: 'assets/bibles', name: 'English.XML' },
    { directory: 'assets/bibles', name: 'Tamil.xml' }
  ]);
  assert.deepEqual(await readBundledBibleFile(root, files[1]), { name: 'Tamil.xml', contents: '<XMLBIBLE/>' });
});

test('reads the bundled ACI logo as base64 image data', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scripture-pod-logo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const logoPath = path.join(root, 'assets/logo/ACI_Logo.png');
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await fs.mkdir(path.dirname(logoPath), { recursive: true });
  await fs.writeFile(logoPath, pngBytes);

  const logo = await readBundledChurchLogo(root);
  assert.equal(logo.name, 'ACI_Logo.png');
  assert.equal(Buffer.from(logo.contents, 'base64').toString('hex'), pngBytes.toString('hex'));
});

test('rejects Bible asset paths outside the bundled directories', async () => {
  await assert.rejects(
    readBundledBibleFile('/tmp', { directory: '../secrets', name: 'Bible.xml' }),
    /Invalid Bible asset directory/
  );
  await assert.rejects(
    readBundledBibleFile('/tmp', { directory: 'assets/bibles', name: '../secret.xml' }),
    /Invalid Bible asset filename/
  );
});