import { pathToFileURL } from 'node:url';

export function verificationPassed({ full, staticResult, criticalResult, fullResult }) {
  return staticResult === 'success' && (full ? fullResult : criticalResult) === 'success';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passed = verificationPassed({
    full: process.env.FULL === 'true',
    staticResult: process.env.STATIC_RESULT,
    criticalResult: process.env.CRITICAL_RESULT,
    fullResult: process.env.FULL_RESULT,
  });
  if (!passed) {
    console.error('Required verification jobs did not all succeed.');
    process.exitCode = 1;
  }
}
