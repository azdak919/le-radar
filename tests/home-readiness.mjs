// Functional readiness is independent of nonessential external image downloads.
export async function waitHomeReady(page) {
  await page.waitForFunction(() =>
    document.getElementById('theme-toggle')?.dataset.themeBound === '1' &&
    document.getElementById('news-list')?.dataset.ready === '1' &&
    document.querySelector('#tuner-play')
  );
}
export async function gotoHomeReady(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitHomeReady(page);
}
