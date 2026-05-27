/**
 * Downloads SAT Contabilidad Electrónica XSD files from SAT servers.
 *
 * Usage: tsx scripts/download-xsd.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const XSD_DIR = resolve(__dirname, '..', 'xsd', 'contabilidade', '1_3');

const XSD_URLS: Record<string, string> = {
  'CatalogoCuentas_1_3.xsd':
    'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd',
  'BalanzaComprobacion_1_3.xsd':
    'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd',
  'PolizasPeriodo_1_3.xsd':
    'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd',
  'AuxiliarCtas_1_3.xsd':
    'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas/AuxiliarCtas_1_3.xsd',
  'AuxiliarFolios_1_3.xsd':
    'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios/AuxiliarFolios_1_3.xsd',
};

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`  Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  writeFileSync(dest, content, 'utf-8');
  console.log(`  Saved: ${dest}`);
}

async function main() {
  console.log('Downloading SAT Contabilidad Electrónica XSD files...');
  console.log(`Target directory: ${XSD_DIR}\n`);

  if (!existsSync(XSD_DIR)) {
    mkdirSync(XSD_DIR, { recursive: true });
  }

  let successes = 0;
  let failures = 0;

  for (const [fileName, url] of Object.entries(XSD_URLS)) {
    const dest = resolve(XSD_DIR, fileName);
    try {
      await downloadFile(url, dest);
      successes++;
    } catch (err) {
      console.error(`  FAILED: ${fileName} — ${(err as Error).message}`);
      failures++;
    }
  }

  console.log(`\nDone: ${successes} downloaded, ${failures} failed.`);
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
