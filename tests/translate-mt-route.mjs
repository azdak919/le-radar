/**
 * Mocks MT : Worker cache-only (POST lookup/store) + gtx/clients5/MyMemory.
 */

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: cors(),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

async function readWorkerBody(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    return {};
  }
}

/**
 * @param {(ctx: { q: string, sl: string, tl: string, source: string }) => string | null | undefined} mapText
 */
export async function mockRadarTranslateApis(page, mapText) {
  const fulfill = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isWorker = /le-radar-translate/.test(url.href);
    const isDict = /clients[45]\.google\.com/.test(url.href);
    const isMm = /mymemory\.translated\.net/.test(url.href);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors() });
      return;
    }

    if (isWorker && request.method() === 'POST') {
      const body = await readWorkerBody(request);
      const tl = String(body.tl || '');
      const sl = String(body.sl || 'auto');
      if (url.pathname.endsWith('/v1/store')) {
        await route.fulfill(json({ ok: true, stored: Array.isArray(body.items) ? body.items.length : 0 }));
        return;
      }
      const list = Array.isArray(body.q) ? body.q : [];
      const hits = {};
      const missed = [];
      for (const q of list) {
        const t = mapText({ q: String(q), sl, tl, source: 'worker' });
        if (t) hits[String(q)] = t;
        else missed.push(String(q));
      }
      await route.fulfill(json({ hits, missed }));
      return;
    }

    const q = url.searchParams.get('q') || '';
    const sl = url.searchParams.get('sl') || '';
    const tl = url.searchParams.get('tl')
      || (url.searchParams.get('langpair') || '').split('|')[1]
      || '';
    const source = isWorker ? 'worker' : (isDict ? 'dict' : (isMm ? 'mymemory' : 'gtx'));
    const t = mapText({ q, sl, tl, source });

    if (isWorker) {
      if (t) await route.fulfill(json({ t }));
      else await route.fulfill(json({ error: 'miss' }, 404));
      return;
    }
    if (isDict) {
      await route.fulfill(json([t || q]));
      return;
    }
    if (isMm) {
      await route.fulfill(json({
        responseStatus: 200,
        responseData: { translatedText: t || q },
      }));
      return;
    }
    await route.fulfill(json([[[t || q, q]]]));
  };

  await page.route(/translate\.googleapis\.com/, fulfill);
  await page.route(/clients[45]\.google\.com/, fulfill);
  await page.route(/le-radar-translate\.azdak\.workers\.dev/, fulfill);
  await page.route(/mymemory\.translated\.net/, fulfill);
}
