/**
 * Download SAT XSLT Files
 *
 * Downloads the official SAT XSLT files required for cadena original generation.
 * Run: npm run download-xslt (from packages/cfdi directory)
 *
 * SAT XSLT URLs:
 * - CFDI 4.0: http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt
 * - TFD 1.1:  http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/cadenaoriginal_TFD_1_1.xslt
 *
 * Downloads to: packages/cfdi/src/xslt/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// XSLT files to download
const XSLT_FILES = [
  {
    name: 'cadenaoriginal_4_0.xslt',
    url: 'http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt',
    description: 'CFDI 4.0 Cadena Original',
  },
  {
    name: 'cadenaoriginal_TFD_1_1.xslt',
    url: 'http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/cadenaoriginal_TFD_1_1.xslt',
    description: 'Timbre Fiscal Digital 1.1 Cadena Original',
  },
];

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'xslt');

/**
 * Download a file from a URL
 */
function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = fs.createWriteStream(outputPath);

    protocol
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log(`  Redirecting to: ${redirectUrl}`);
            downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: Failed to download ${url}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete partial file
        reject(err);
      });
  });
}

/**
 * Verify the downloaded file is a valid XSLT
 */
function verifyXSLT(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for basic XSLT structure
    if (!content.includes('xsl:stylesheet') && !content.includes('xsl:transform')) {
      return false;
    }

    // Check it's not empty or too small
    if (content.length < 100) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Main download function
 */
async function main() {
  console.log('SAT XSLT File Downloader');
  console.log('========================\n');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`Creating directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let successCount = 0;
  let failCount = 0;

  for (const xslt of XSLT_FILES) {
    const outputPath = path.join(OUTPUT_DIR, xslt.name);

    console.log(`Downloading: ${xslt.description}`);
    console.log(`  URL: ${xslt.url}`);
    console.log(`  Output: ${outputPath}`);

    try {
      await downloadFile(xslt.url, outputPath);

      // Verify the download
      if (verifyXSLT(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`  [OK] Downloaded successfully (${stats.size} bytes)\n`);
        successCount++;
      } else {
        console.log(`  [WARN] File downloaded but does not appear to be valid XSLT\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  [ERROR] ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      failCount++;
    }
  }

  console.log('========================');
  console.log(`Summary: ${successCount} succeeded, ${failCount} failed`);

  if (failCount > 0) {
    console.log('\nNote: Some files failed to download. This may be due to:');
    console.log('- Network issues');
    console.log('- SAT server unavailability');
    console.log('- URL changes');
    console.log('\nThe bundled XSLT files in the repository should still work.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
