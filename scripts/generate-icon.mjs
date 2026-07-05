import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'assets', 'logo.png');
const target = path.join(projectRoot, 'assets', 'icon.ico');

const ico = await pngToIco(source);
await writeFile(target, ico);
