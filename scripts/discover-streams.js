#!/usr/bin/env node
/**
 * RÉQ Stream Tracker Bot
 * 
 * Discovers and validates direct audio streams for student radios.
 * 
 * Usage:
 *   node scripts/discover-streams.js
 *   node scripts/discover-streams.js --update   # writes back to radios.json
 *   node scripts/discover-streams.js --radio ckut
 *
 * Run via GitHub Actions on a schedule to keep streams fresh.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const RADIOS_PATH = path.join(__dirname, '..', 'radios.json');
const TIMEOUT = 8000;

// Known good direct streams (updated by bot or manually)
const KNOWN_STREAMS = {
  ckut: 'https://ckut.out.airtime.pro/ckut_a',
  chyz: 'https://ecoutez.chyz.ca/proxy/chyz943/stream',
};

// Common discovery patterns
const COMMON_PATHS = [
  '/stream',
  '/live',
  '/radio',
  '/mp3',
  '/;stream.mp3',
  '/stream.mp3',
  '/listen',
  '/;',
];

async function validateStream(url) {
  if (!url) return { valid: false, reason: 'no url' };

  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'RÉQ-StreamBot/1.0 (+https://github.com/azdak919/radios-etudiantes-qc)',
          'Icy-MetaData': '1',
        },
        timeout: TIMEOUT,
      },
      (res) => {
        const contentType = res.headers['content-type'] || '';
        const icyMetaint = res.headers['icy-metaint'];
        const icyName = res.headers['icy-name'];

        const isAudio = contentType.includes('audio') ||
                        contentType.includes('mpeg') ||
                        !!icyMetaint;

        if (isAudio || res.statusCode === 200) {
          // Consume a bit of data to confirm it's streaming
          let bytes = 0;
          res.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > 4096) {
              res.destroy();
            }
          });

          resolve({
            valid: true,
            contentType,
            icyName: icyName || null,
            icyMetaint: icyMetaint ? parseInt(icyMetaint) : null,
            status: res.statusCode,
          });
        } else {
          res.destroy();
          resolve({ valid: false, reason: `bad content-type: ${contentType}`, status: res.statusCode });
        }
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ valid: false, reason: 'timeout' });
    });

    req.on('error', (err) => {
      resolve({ valid: false, reason: err.message });
    });
  });
}

async function tryDiscoverFromWebsite(website) {
  // Very basic discovery — in real bot you would use cheerio + fetch the page
  // For now, we return common guesses + known patterns
  if (!website) return [];

  try {
    const domain = new URL(website).hostname.replace('www.', '');

    const candidates = [
      `https://${domain}/stream`,
      `https://stream.${domain}`,
      `http://${domain}:8000/stream`,
      `https://${domain}:8443/stream`,
    ];

    return candidates;
  } catch {
    return [];
  }
}

async function processRadio(radio) {
  const result = { ...radio };

  // 1. Use known good if we have one
  if (KNOWN_STREAMS[radio.id]) {
    const test = await validateStream(KNOWN_STREAMS[radio.id]);
    if (test.valid) {
      result.stream = KNOWN_STREAMS[radio.id];
      result._streamStatus = 'working';
      result._streamChecked = new Date().toISOString();
      result._streamMeta = test;
      return result;
    }
  }

  // 2. Validate existing
  if (radio.stream) {
    const test = await validateStream(radio.stream);
    if (test.valid) {
      result._streamStatus = 'working';
      result._streamChecked = new Date().toISOString();
      result._streamMeta = test;
      return result;
    } else {
      console.log(`  ✗ ${radio.id} existing stream failed: ${test.reason}`);
      // keep it but mark bad
      result._streamStatus = 'broken';
    }
  }

  // 3. Try to discover new ones (basic)
  const candidates = await tryDiscoverFromWebsite(radio.website);
  for (const candidate of candidates) {
    const test = await validateStream(candidate);
    if (test.valid) {
      console.log(`  ✓ Discovered for ${radio.id}: ${candidate}`);
      result.stream = candidate;
      result._streamStatus = 'working';
      result._streamChecked = new Date().toISOString();
      result._streamMeta = test;
      return result;
    }
  }

  // Could not find reliable direct stream
  if (!result.stream) {
    result.stream = null;
  }
  result._streamStatus = result.stream ? 'unknown' : 'none';
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes('--update');
  const specificRadio = args.find(a => a.startsWith('--radio='))?.split('=')[1];

  let radios = JSON.parse(fs.readFileSync(RADIOS_PATH, 'utf8'));

  console.log('RÉQ Stream Tracker Bot');
  console.log('======================\n');

  const results = [];

  for (const radio of radios) {
    if (specificRadio && radio.id !== specificRadio) continue;

    console.log(`→ ${radio.name} (${radio.id})`);

    const updated = await processRadio(radio);
    results.push(updated);

    if (updated.stream && updated._streamStatus === 'working') {
      console.log(`   Stream: ${updated.stream} ✓\n`);
    } else {
      console.log(`   Stream: ${updated.stream || 'none'} (${updated._streamStatus})\n`);
    }
  }

  if (shouldUpdate) {
    // Preserve other fields
    const final = radios.map(old => {
      const newOne = results.find(r => r.id === old.id) || old;
      // Only update stream-related fields
      return {
        ...old,
        stream: newOne.stream,
        _streamStatus: newOne._streamStatus,
        _streamChecked: newOne._streamChecked,
      };
    });

    fs.writeFileSync(RADIOS_PATH, JSON.stringify(final, null, 2) + '\n');
    console.log('radios.json updated with discovered streams.');
  } else {
    console.log('Dry run. Use --update to write changes.');
  }
}

main().catch(console.error);