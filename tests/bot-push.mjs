// scripts/bot-push.sh : rebase normal, régénération des fichiers générés en
// conflit, --redo sur conflit de données, et groupe data-writers partagé.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/bot-push.sh');
const root = mkdtempSync(join(tmpdir(), 'bot-push-'));
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, GITHUB_REF_NAME: 'main', BOT_PUSH_TRIES: '2' } });
const clone = (name) => {
  sh(`git clone -q origin.git ${name}`, root);
  const d = join(root, name);
  sh('git config user.email t@t && git config user.name t && git config commit.gpgsign false', d);
  return d;
};
try {
  sh('git init -q --bare -b main origin.git', root);
  const a = clone('a');
  writeFileSync(join(a, 'index.html'), '0\n'); writeFileSync(join(a, 'data.json'), '0\n');
  sh('git add . && git commit -qm init && git push -q origin HEAD:main', a);
  const b = clone('b');

  // 1) Conflit sur un fichier généré : version de main + régénération.
  writeFileSync(join(b, 'index.html'), 'B\n'); writeFileSync(join(b, 'b.json'), 'b\n');
  sh('git add . && git commit -qm b && git push -q', b);
  writeFileSync(join(a, 'index.html'), 'A\n'); writeFileSync(join(a, 'data.json'), 'a\n');
  sh('git commit -qam a', a);
  writeFileSync(join(a, 'report.txt'), 'non publié\n');
  sh(`bash ${script} --regen "echo REGEN > index.html"`, a);
  assert.equal(sh('git show origin/main:index.html', a), 'REGEN\n');
  assert.equal(sh('git show origin/main:data.json', a), 'a\n');
  assert.equal(sh('git show origin/main:b.json', a), 'b\n', 'le travail de l’autre bot est conservé');
  assert.equal(readFileSync(join(a, 'report.txt'), 'utf8'), 'non publié\n', 'fichier local restauré');

  // 2) Conflit de données : --redo repart de main au lieu d’écraser.
  sh('git pull -q', b);
  writeFileSync(join(b, 'data.json'), 'b2\n'); sh('git commit -qam b2 && git push -q', b);
  writeFileSync(join(a, 'data.json'), 'a2\n'); sh('git commit -qam a2', a);
  sh(`bash ${script} --redo "echo redo >> data.json && git commit -qam redo"`, a);
  assert.equal(sh('git show origin/main:data.json', a), 'b2\nredo\n');

  // 3) Tous les workflows qui poussent passent par bot-push.sh et le groupe partagé.
  for (const f of readdirSync('.github/workflows')) {
    const y = readFileSync(join('.github/workflows', f), 'utf8');
    if (!/git push|bot-push\.sh/.test(y)) continue;
    if (f === 'maintain.yml') continue; // migré avec la refonte de la maintenance (lot B)
    assert.doesNotMatch(y, /-X theirs/, f);
    assert.doesNotMatch(y, /\n\s*git push\s*(\n|\|\|)/, `${f} : push direct sans bot-push.sh`);
    if (f !== 'update-sports-live.yml') assert.match(y, /group: data-writers\n\s*cancel-in-progress: false\n\s*queue: max/, f);
  }
  console.log('OK bot-push');
} finally {
  rmSync(root, { recursive: true, force: true });
}
