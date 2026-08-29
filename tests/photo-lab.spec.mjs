import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test.describe.configure({ mode: 'serial' });
const PORT = Number(process.env.PHOTO_LAB_PORT || 8779);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

test.beforeAll(async () => {
  child = spawn(process.execPath, [join(root, 'scripts/photo-lab-server.js')], {
    cwd: root,
    env: { ...process.env, PHOTO_LAB_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('labo photo: timeout démarrage')), 8000);
    const onData = (buf) => {
      if (String(buf).includes('Labo photo')) {
        clearTimeout(t);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
  });
});

test.afterAll(async () => {
  if (child && !child.killed) child.kill('SIGTERM');
});

test('tableau de bord local', async ({ page }) => {
  await page.goto(`${BASE}/dev/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('Tableau de bord');
  await expect(page.locator('a.card.featured')).toHaveAttribute('href', './photo-lab/');
  await expect(page.locator('a.card[href="../index.html"]').first()).toBeVisible();
  const sports = page.locator('a.card[href="./sports-strip-lab.html"]');
  await expect(sports).toBeVisible();
  await expect(sports.locator('strong')).toContainText('Cartes sports');
  const pageLab = page.locator('a.card[href="./sports-page-lab.html"]');
  await expect(pageLab).toBeVisible();
  await expect(pageLab.locator('strong')).toContainText('Cartes page Sports');
  const posters = page.locator('a.card[href="../affiches/"]');
  await expect(posters).toBeVisible();
  await expect(posters.locator('strong')).toContainText('Imprimer une affiche');
});

test('générateur d’affiches public', async ({ page }) => {
  await page.goto(`${BASE}/affiches/`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toContainText('Imprimer une affiche');
  await expect(page.locator('.masthead .wordmark-brand')).toBeVisible();
  await expect(page.locator('.site-foot').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Labo photo' })).toHaveCount(0);
  await expect(page.locator('label:has(input[name="format"][value="letter"])')).toBeVisible();
  await expect(page.locator('label:has(input[name="format"][value="legal"])')).toBeVisible();
  await expect(page.locator('label:has(input[name="campus"][value="uqtr"])')).toBeVisible();
  await expect(page.locator('label:has(input[name="campus"][value="hec"])')).toBeVisible();
  await expect(page.getByRole('button', { name: /PDF 600 dpi/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /JPEG 600 dpi/ }).first()).toBeVisible();
  await page.locator('#preview canvas').waitFor({ timeout: 20000 });
  const previewBox = await page.locator('#preview canvas').boundingBox();
  expect(previewBox).toBeTruthy();
  expect(previewBox.height).toBeGreaterThan(360);
  expect(previewBox.width).toBeGreaterThan(200);
  expect(previewBox.height).toBeGreaterThan(previewBox.width);
  await page.locator('label:has(input[name="format"][value="letter"])').click();
  await expect(page.locator('#status')).toContainText('Lettre', { timeout: 15000 });
  await expect(page.locator('#status')).toContainText('5100 × 6600');
  await expect(page.locator('#dpi-1200-choice')).toBeVisible();
  await page.locator('label:has(input[name="dpi"][value="1200"])').click();
  await expect(page.getByRole('button', { name: /JPEG 1200 dpi/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /PDF 1200 dpi/ }).first()).toBeVisible();
  await expect(page.locator('#status')).toContainText('1200 dpi');
  await expect(page.locator('#status')).toContainText('10200 × 13200');
  await page.locator('label:has(input[name="dpi"][value="300"])').click();
  await expect(page.locator('#status')).toContainText('2550 × 3300');
  await expect(page.getByRole('button', { name: /PDF 300 dpi/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /JPEG 300 dpi/ }).first()).toBeVisible();
  await expect(page.locator('#photo-grid label')).toHaveCount(6);
  await page.locator('#photo-more').click();
  const n = await page.locator('#photo-grid label').count();
  expect(n).toBeGreaterThan(20);
  const bilingue = page.locator('label:has(input[name="lang"][value="bilingue"])');
  await expect(bilingue).toBeHidden();
  await page.locator('label:has(input[name="campus"][value="mcgill"])').click();
  await expect(bilingue).toBeVisible();
  await page.locator('label:has(input[name="campus"][value="udem"])').click();
  const udemTitles = (await page.locator('#photo-grid label').evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''))).join(' ').toLowerCase();
  expect(udemTitles).not.toContain('uqam');
  expect(udemTitles).not.toContain('hall building');
  expect(udemTitles).not.toContain('mcgill');
  await page.locator('label:has(input[name="campus"][value="laval"])').click();
  await expect(bilingue).toBeHidden();
  await page.locator('#photo-more').click();
  const lavalTitles = (await page.locator('#photo-grid label').evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''))).join(' ').toLowerCase();
  expect(lavalTitles).toContain('casault');
  expect(lavalTitles).toContain('grand axe');
  expect(lavalTitles).toContain('palasis');
  expect(lavalTitles).toContain('bonenfant');
  expect(lavalTitles).not.toContain('pouliot 07');
  expect(lavalTitles).not.toContain('pouliot 08');
  expect(lavalTitles).not.toContain('pouliot 09');
  await expect(page.locator('#greeting')).toContainText('Bonne rentrée');
  await expect(page.locator('label:has(input[name="langs"][value="oui"])')).toContainText('Langues du site');
  await expect(page.locator('input[name="langs"][value="oui"]')).toBeChecked();
  await expect(page.locator('.solid--radar')).toBeVisible();
  await expect(page.locator('#uni-toggle')).toBeVisible();
  await page.locator('label:has(input[name="campus"][value="concordia"])').click();
  await page.locator('#photo-grid label').nth(1).click();
  await expect(page.locator('#status')).toContainText('300 dpi', { timeout: 20000 });
  await expect(page.locator('#status')).not.toContainText('qrSide');
  await page.selectOption('#greeting', 'relache');
  await expect(page.locator('#crop-tools')).toBeVisible();
  await page.locator('#photo-angle').fill('8');
  await expect(page.locator('#status')).not.toContainText('qrSide');
});

test('labo cartes sports : colonne mobile, une carte, marquee L→R', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/dev/sports-strip-lab.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#formats')).toHaveCount(0);
  await expect(page.locator('#preview')).toHaveCount(0);
  const col = page.locator('#col');
  await expect(col).toBeVisible();
  await expect.poll(async () => Math.round((await page.locator('#cta-band .masthead-sports-strip').first().boundingBox()).width)).toBeLessThanOrEqual(400);

  await expect(page.locator('#cta-band .sports-chip--cta').first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip--match')).toHaveCount(0);
  await expect(page.locator('#standard-chips .sports-chip--match').first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText(/il y a \d/)).toHaveCount(0);
  await expect(page.locator('#cta-band').getByText('dans 3 h', { exact: false })).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__cta-sub-text', { hasText: 'dans 45 min' })).toBeVisible();
  await expect(page.getByText('avant-hier', { exact: false }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__cta-tag--brand')).toBeVisible();
  await expect(page.locator('#cta-band').getByText('LE-RADAR.ca').first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText(/Réseau Académique/).first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText('Scores collégiaux')).toHaveCount(0);
  const todayUpcoming = page.locator('#cta-band .case').filter({ hasText: 'dans 3 h' }).first();
  await expect(todayUpcoming.locator('.sports-chip__cta-sub-text')).toContainText(/Aujourd’hui/);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'à venir (visiteur)' }).locator('.sports-chip__cta-sub-text')).toContainText(/Aujourd’hui/);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'à venir (visiteur)' }).locator('.sports-chip__cta-tag-meridiem')).toHaveText(/cet\s*AM/i);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'aujourd’hui AM (victoire)' }).locator('.sports-chip__cta-tag-meridiem')).toHaveText(/cet\s*AM/i);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'CTA — aujourd’hui (victoire)' }).locator('.sports-chip__cta-tag-meridiem')).toHaveText(/ce\s*PM/i);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'demain AM' }).locator('.sports-chip__cta-tag-meridiem')).toHaveText(/^AM$/i);
  await expect(todayUpcoming.locator('.sports-chip__cta-tag')).toHaveText(/À\s*venir/i);
  await expect(todayUpcoming.locator('.sports-chip__cta-tag-lines')).toHaveCount(1);
  await expect(todayUpcoming.locator('.sports-chip__cta-tag-meridiem')).toHaveText(/ce\s*PM/i);
  await expect(todayUpcoming.locator('.sports-chip__vs')).toHaveText(/reçoivent/i);
  const vsTone = await todayUpcoming.locator('.sports-chip__vs').evaluate((el) => {
    const vs = getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number) || [];
    const name = getComputedStyle(el.parentElement.querySelector('.sports-chip__name')).color.match(/[\d.]+/g)?.map(Number) || [];
    const a = (c) => (c.length >= 4 ? c[3] : 1) * (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]);
    return { vs: a(vs), name: a(name), weight: getComputedStyle(el).fontWeight };
  });
  expect(vsTone.vs, 'verbe reçoit plus pâle que les noms').toBeLessThan(vsTone.name * 0.85);
  expect(Number(vsTone.weight), 'verbe reçoit : poids 500, pas 800').toBeLessThanOrEqual(500);
  const todayLamp = await todayUpcoming.locator('.sports-chip__cta-tag').evaluate((el) => el.dataset.ctaLamp);
  expect(todayLamp, 'match du jour : À venir, pulse comme En cours').toBe('soon');
  const soonPulse = await todayUpcoming.locator('.sports-chip--cta').evaluate((chip) => {
    const tag = chip.querySelector('.sports-chip__cta-tag');
    return {
      chip: getComputedStyle(chip).animationName,
      tag: getComputedStyle(tag).animationName,
    };
  });
  expect(soonPulse.chip, 'carte À venir : halo rouge').toMatch(/sports-cta-ring-pulse/);
  expect(soonPulse.tag, 'pastille À venir : pulse En cours').toMatch(/sports-cta-tag-pulse/);
  const tomorrowCard = page.locator('#cta-band .case').filter({ hasText: 'CTA — demain' }).first();
  await expect(tomorrowCard.locator('.sports-chip__cta-tag')).toHaveText(/Demain/i);
  await expect(tomorrowCard.locator('.sports-chip__cta-tag-lines')).toHaveCount(1);
  await expect(tomorrowCard.locator('.sports-chip__cta-tag-meridiem')).toHaveText(/^PM$/i);
  const hierCard = page.locator('#cta-band .case').filter({ hasText: 'CTA — hier (victoire)' });
  await expect(hierCard.locator('.sports-chip__cta-tag-meridiem')).toHaveText(/^(AM|PM)$/i);
  const liveCard = page.locator('#cta-band .case').filter({ hasText: 'CTA — en direct' }).first();
  await expect(liveCard.locator('.sports-chip__cta-tag-score')).toBeVisible();
  await expect(liveCard.locator('.sports-chip__cta-tag-meridiem')).toHaveCount(0);
  const tomorrowLamp = await tomorrowCard.locator('.sports-chip__cta-tag').evaluate((el) => el.dataset.ctaLamp);
  expect(tomorrowLamp, 'Demain : pastille jaune, pas À venir').toBe('next');
  const prochainLines = page.locator('#cta-band .sports-chip__cta-tag[data-cta-tag="Prochain match"] .sports-chip__cta-tag-lines');
  await expect(prochainLines.first()).toBeVisible();
  await expect(prochainLines.first()).toHaveText(/Prochain\s*match/i);
  await expect(prochainLines.first().locator(':scope > span')).toHaveCount(2);
  await expect(page.locator('#cta-band .sports-chip__cta-tag[data-cta-tag="En direct"] .sports-chip__cta-tag-score').first()).toBeVisible();
  const glyphFit = await page.locator('#cta-band .sports-chip--cta').first().evaluate((chip) => {
    const glyph = chip.querySelector('.sports-chip__cta-glyph');
    const tag = chip.querySelector('.sports-chip__cta-tag');
    if (!glyph || !tag) return { ok: false };
    const cr = chip.getBoundingClientRect();
    const gr = glyph.getBoundingClientRect();
    const tr = tag.getBoundingClientRect();
    return {
      ok: true,
      glyphW: gr.width,
      fullyInChip: gr.left >= cr.left - 1 && gr.right <= cr.right + 1,
      rightOfTag: gr.left >= tr.right - 1,
    };
  });
  expect(glyphFit.ok, 'CTA prochain : glyphe présent').toBe(true);
  expect(glyphFit.glyphW, 'CTA prochain : glyphe a une largeur').toBeGreaterThan(8);
  expect(glyphFit.fullyInChip, 'CTA prochain : glyphe entier dans la carte (pas d’excédent)').toBe(true);
  expect(glyphFit.rightOfTag, 'CTA prochain : glyphe à droite de la pastille').toBe(true);
  const hierFit = await page.locator('.sports-chip__cta-tag[data-cta-tag="Hier"]').first().evaluate((tag) => {
    const chip = tag.closest('.sports-chip--cta');
    const glyph = chip?.querySelector('.sports-chip__cta-glyph');
    if (!chip || !glyph) return { ok: false };
    const cr = chip.getBoundingClientRect();
    const gr = glyph.getBoundingClientRect();
    const tr = tag.getBoundingClientRect();
    return {
      ok: true,
      fullyInChip: gr.left >= cr.left - 1 && gr.right <= cr.right + 1,
      rightOfTag: gr.left >= tr.right - 1,
    };
  });
  expect(hierFit.ok, 'CTA hier : glyphe présent').toBe(true);
  expect(hierFit.fullyInChip, 'CTA hier : glyphe entier dans la carte (pas d’excédent)').toBe(true);
  expect(hierFit.rightOfTag, 'CTA hier : glyphe à droite de la pastille').toBe(true);
  await expect(page.locator('#cta-band .sports-chip__cta-tag[data-cta-tag="Avant-hier"]')).toHaveCount(0);
  await expect(page.locator('.sports-chip__cta-tag[data-cta-tag="Hier"]').first()).toBeVisible();
  await expect(page.locator('.sports-chip__cta-tag[data-cta-tag="Aujourd’hui"]').first()).toBeVisible();
  const noLed = async (sel) => page.locator(sel).first().evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    return {
      display: before.display,
      content: String(before.content || ''),
      width: parseFloat(before.width) || 0,
    };
  });
  for (const [label, sel] of [
    ['Prochain match', '.sports-chip__cta-tag[data-cta-tag="Prochain match"]'],
    ['Hier', '.sports-chip__cta-tag[data-cta-tag="Hier"]'],
    ['Aujourd’hui', '.sports-chip__cta-tag[data-cta-lamp="today"]'],
    ['En direct', '.sports-chip__cta-tag[data-cta-tag="En direct"]'],
  ]) {
    const led = await noLed(sel);
    expect(led.display === 'none' || led.content === 'none' || led.width === 0, `${label} : pas de voyant LED`).toBe(true);
  }
  const pillRgb = async (tag) => page.locator(`.sports-chip__cta-tag[data-cta-tag="${tag}"]`).first().evaluate((el) => {
    const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return m;
  });
  const pillWidth = async (tag) => page.locator(`.sports-chip__cta-tag[data-cta-tag="${tag}"]`).first().evaluate((el) => el.getBoundingClientRect().width);
  const [ppr, ppg, ppb] = await pillRgb('Prochain match');
  const [phr, phg, phb] = await pillRgb('Hier');
  const [par, pag] = await page.locator('.sports-chip__cta-tag[data-cta-lamp="today"]').first().evaluate((el) => {
    const m = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return m;
  });
  const [elr, elg] = await pillRgb('En direct');
  expect(ppr, 'Prochain : pastille jaune').toBeGreaterThan(200);
  expect(ppg, 'Prochain : pastille jaune').toBeGreaterThan(180);
  expect(ppb, 'Prochain : pastille jaune (pas crème)').toBeLessThan(80);
  expect(phr, 'Hier : pastille pourpre (R)').toBeGreaterThan(80);
  expect(phg, 'Hier : pastille pourpre, pas verte').toBeLessThan(70);
  expect(phb, 'Hier : pastille pourpre (B)').toBeGreaterThan(70);
  expect(phr - phg, 'Hier : pastille pourpre (R>G)').toBeGreaterThan(40);
  expect(par - pag, 'Aujourd’hui résultat : pastille rouge saturée').toBeGreaterThan(80);
  expect(elr - elg, 'En direct : pastille rouge inchangée').toBeGreaterThan(80);
  const pillFit = async (tag) => page.locator(`.sports-chip__cta-tag[data-cta-tag="${tag}"]`).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, overflow: el.scrollWidth - el.clientWidth };
  });
  const [wProchain, wHier, wToday] = await Promise.all([
    pillWidth('Prochain match'), pillWidth('Hier'), pillWidth('Aujourd’hui'),
  ]);
  const [fitHier, fitToday, fitNext] = await Promise.all([
    pillFit('Hier'), pillFit('Aujourd’hui'), pillFit('Prochain match'),
  ]);
  expect(wHier, 'Hier : pastille collée, plus de rail 8 rem').toBeLessThan(100);
  expect(wToday, 'Aujourd’hui plus large que Hier (libellé plus long)').toBeGreaterThan(wHier + 8);
  expect(wProchain, 'Prochain match 2 lignes plus étroit qu’Aujourd’hui').toBeLessThan(wToday + 1);
  expect(fitHier.overflow, 'Hier : pas d’excédent').toBeLessThanOrEqual(1);
  expect(fitToday.overflow, 'Aujourd’hui : pas d’excédent').toBeLessThanOrEqual(1);
  expect(fitNext.overflow, 'Prochain match : pas d’excédent').toBeLessThanOrEqual(1);
  await expect(page.locator('.sports-chip__cta-eyebrow--head', { hasText: /^Prochain$/ })).toHaveCount(0);
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^V$/ }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^D$/ }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge', { hasText: /^N$/ }).first()).toBeVisible();
  const placeOffPodium = page.locator('#cta-band .case').filter({ hasText: 'McGill 7e/12' });
  await expect(placeOffPodium).toBeVisible();
  await expect(placeOffPodium.locator('.sports-chip__badge')).toHaveCount(0);
  await expect(page.locator('#cta-band .sports-chip__badge--place', { hasText: '🥇' }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge--place', { hasText: '🥈' }).first()).toBeVisible();
  await expect(page.locator('#cta-band .sports-chip__badge--place', { hasText: '🥉' }).first()).toBeVisible();
  await expect(page.locator('#cta-band').getByText('1er/12')).toBeVisible();
  await expect(page.locator('#cta-band .case').filter({ hasText: 'hier (place)' })).toBeVisible();
  await expect(page.locator('#cta-band .case').filter({ hasText: 'hier (or)' })).toBeVisible();
  await expect(page.locator('#cta-band .case').filter({ hasText: 'aujourd’hui (argent)' })).toBeVisible();
  const liveNoScore = page.locator('#cta-band .case').filter({ hasText: 'en cours (sans score)' });
  await expect(liveNoScore).toBeVisible();
  await expect(liveNoScore.locator('.sports-chip__score')).toHaveText('—');
  await expect(liveNoScore.locator('.sports-chip__cta-tag-score')).toHaveText('—');
  await expect(liveNoScore.locator('.sports-chip__cta-sub-text')).toContainText(/19 h 00/);
  await expect(liveNoScore.locator('.sports-chip__cta-sub-text')).not.toContainText(/mis à jour à/);
  await expect(liveNoScore.locator('.sports-chip__vs')).toHaveCount(0);
  await expect(page.locator('#standard-chips .case').filter({ hasText: 'voile argent' }).first()).toBeVisible();
  await expect(page.locator('#standard-chips .case').filter({ hasText: 'voile bronze' }).first()).toBeVisible();
  await expect(page.locator('#standard-chips .case').filter({ hasText: 'demain visiteur' }).locator('.sports-chip__vs')).toHaveText(/^chez$/);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'à venir (visiteur)' }).locator('.sports-chip__vs')).toHaveText(/^chez$/);
  await expect(page.locator('#cta-band .case').filter({ hasText: 'hier (défaite)' }).locator('.sports-chip__badge')).toHaveText(/^D$/);
  await expect(page.locator('#standard-chips .case').filter({ has: page.getByText('Puce — demain', { exact: true }) }).locator('.sports-chip__sub-text')).toContainText(/^Demain/);
  await expect(page.locator('#standard-chips .case').filter({ hasText: 'Puce — à venir (reçoit)' }).locator('.sports-chip__sub-text')).toContainText(/^À venir/);
  await expect(page.locator('#standard-chips .sports-chip--match[data-sports-live="1"]').first()).toBeVisible();
  await expect(page.locator('#standard-chips .sports-chip__badge--place').first()).toBeVisible();
  const labCopy = await page.locator('body').innerText();
  expect(labCopy, 'pas d’abréviation univ. — le marquee porte le mot entier').not.toMatch(/\buniv\./);

  const overflowing = page.locator('#cta-band .case').filter({ hasText: 'à venir (reçoit)' }).locator('.sports-chip--cta');
  await expect(overflowing).toHaveClass(/is-overflowing/, { timeout: 8000 });
  const title = overflowing.locator('.sports-chip__cta-text').first();
  await expect.poll(async () => title.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.animationName}|${s.animationIterationCount}|${s.whiteSpace}`;
  })).toMatch(/sports-(?:cta|chip)-scroll\|infinite\|nowrap/);
  await expect.poll(async () => title.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    return Math.abs(Number(m[1].split(',')[4]));
  }), { timeout: 6000 }).toBeGreaterThan(4);
});

test('labo cartes page sports : variantes V D N prochain creux', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/dev/sports-page-lab.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lab-nav a')).toHaveCount(21);
  const firstBrand = page.locator('#fiches .sports-panel__brand').first();
  await expect(firstBrand).toBeVisible();
  const chromeBox = await page.locator('.lab-chrome').boundingBox();
  const brandBox = await firstBrand.boundingBox();
  expect(brandBox.y, 'entête de carte sous la barre, pas dessous').toBeGreaterThan(chromeBox.y + chromeBox.height - 1);
  const card = page.locator('#fiches .lab-case .sports-panel').first();
  await expect.poll(async () => Math.round((await card.boundingBox()).width)).toBeLessThanOrEqual(390);
  await expect(page.locator('#fiches .sports-result--W').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--L').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--D').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--next').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--live').first()).toBeVisible();
  const livePill = page.locator('#fiches .sports-panel__live').first();
  await expect(livePill).toBeVisible();
  await expect(livePill).toHaveText(/En direct/i);
  const liveFilter = page.locator('#lab-filters [data-filter-period="live"]');
  await expect(liveFilter).toBeVisible();
  await liveFilter.click();
  await expect(page.locator('#fiches .lab-case:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#fiches .lab-case:not([hidden]) .sports-panel__live')).toBeVisible();
  await page.locator('#lab-filters [data-filter-period="all"]').click();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^V$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^D$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge', { hasText: /^N$/ }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__venue', { hasText: 'domicile' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__venue', { hasText: 'extérieur' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__vs', { hasText: 'régate' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--place').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge--place', { hasText: '🥇' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__badge--place', { hasText: '🥈' }).first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result__score', { hasText: '7e/12' })).toBeVisible();
  await expect(page.locator('#fiches .sports-result__score', { hasText: '1er/12' })).toBeVisible();
  await expect(page.locator('#fiches .lab-case').filter({ hasText: 'Place / régate — argent' }).locator('.sports-result__badge', { hasText: /^V$/ })).toHaveCount(0);
  await expect(page.locator('#fiches .sports-panel__empty').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-panel__empty--club').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-panel--external').first()).toBeVisible();
  await expect(page.locator('#fiches .sports-result--prior-season').first()).toBeVisible();
  await expect(page.locator('#fiches .is-spotlight').first()).toBeVisible();
  await expect(page.locator('#formats iframe')).toHaveCount(4);
  await page.locator('#lab-nav a', { hasText: 'Victoire (V, vert)' }).click();
  await expect(page.locator('.lab-case').filter({ hasText: 'Victoire (V, vert)' })).toBeInViewport();
});

test('labo photo : grille puis fiche, suivant en barre', async ({ page }) => {
  await page.goto(`${BASE}/dev/photo-lab/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#grid .card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('body')).toHaveClass(/mode-grid/);
  await page.locator('#grid .card').first().click();
  await expect(page.locator('body')).toHaveClass(/mode-detail/);
  await expect(page.locator('#panel-body')).toBeVisible();
  await expect(page.locator('#counter')).toContainText('/');
  await expect(page.locator('#next-btn')).toBeVisible();
  await expect(page.locator('#prev-btn')).toBeVisible();
  const firstSrc = await page.locator('#full-photo').getAttribute('src');
  await page.locator('#next-btn').click();
  await expect(page.locator('#counter')).toContainText('2 /');
  await expect(page.locator('#full-photo')).not.toHaveAttribute('src', firstSrc);
  await expect(page.locator('#band-desktop')).toBeVisible();
  await expect(page.locator('#band-mobile')).toBeVisible();
  const yBefore = await page.locator('#focal-val').textContent();
  const box = await page.locator('#crop-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
  await page.mouse.up();
  await expect(page.locator('#focal-val')).toHaveText(yBefore);
  await page.locator('#focal').evaluate((el) => {
    el.value = '220';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#focal-val')).toHaveText('0.22');
  await expect(page.locator('#grid-btn')).toBeVisible();
  await page.locator('#grid-btn').click();
  await expect(page.locator('#grid .card').first()).toBeVisible();
  await expect(page.locator('#save-meta-btn')).toContainText('Enregistrer tout');
  await expect(page.locator('#persist-hint')).toContainText('fichiers locaux');
});

test('labo photo : Enregistrer reste sur la même fiche et garde saison / cadrage', async ({ page }) => {
  await page.goto(`${BASE}/dev/photo-lab/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#grid .card').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#grid .card').first().click();
  await expect(page.locator('#panel-body')).toBeVisible();
  const title = (await page.locator('#photo-meta').textContent()) || '';
  const seasons = page.locator('fieldset.seasons').first();
  await seasons.scrollIntoViewIfNeeded();
  const seasonBox = await seasons.boundingBox();
  const dockBox = await page.locator('.dock').boundingBox();
  expect(seasonBox, 'bloc saison hors écran').toBeTruthy();
  expect(dockBox, 'barre d’actions hors écran').toBeTruthy();
  expect(seasonBox.y + seasonBox.height, 'saisons recouvertes par Enregistrer').toBeLessThanOrEqual(dockBox.y + 1);
  const beforeSeason = await page.locator('input[name="season"]:checked').getAttribute('value');
  const target = beforeSeason === 'ete' ? 'hiver' : 'ete';
  await page.locator(`label.tag:has(input[name="season"][value="${target}"])`).click();
  await expect(page.locator('#status')).toContainText(/Enregistré/i, { timeout: 15_000 });
  await expect(page.locator('#photo-meta')).toContainText(title.slice(0, 12));
  await expect(page.locator(`input[name="season"][value="${target}"]`)).toBeChecked();
  await expect(page.locator('#status')).toContainText(target === 'ete' ? 'été' : 'hiver');
  await page.locator('label.tag:has(input[name="season"][value="all"])').click();
  await expect(page.locator('#status')).toContainText(/toutes saisons/i, { timeout: 15_000 });
  await expect(page.locator('input[name="season"][value="all"]')).toBeChecked();
  await page.locator('#undo-btn').click();
  await expect(page.locator(`input[name="season"][value="${target}"]`)).toBeChecked({ timeout: 10_000 });
  await page.locator('#undo-btn').click();
  await expect(page.locator('#status')).toContainText(/Enregistré|Annul/i, { timeout: 10_000 });
});
