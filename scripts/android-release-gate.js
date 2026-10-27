#!/usr/bin/env node
'use strict';
// CLI : node scripts/android-release-gate.js plan|decide  (sortie JSON)
//  plan   : dernier tag, changements app, version suivante (lit git + build.gradle)
//  decide : applique les garde-fous ; entrée = variables d'environnement GATE_*
const { execSync } = require('child_process');
const fs = require('fs');
const G = require('./android-release-gate-lib');
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();

function plan() {
  const last = sh("git tag --list 'android-v*' --sort=-creatordate | head -1");
  const lastTagIso = last ? sh(`git log -1 --format=%cI ${last}`) : null;
  const files = last ? sh(`git diff --name-only ${last}..HEAD`).split('\n').filter(Boolean) : [];
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  const prev = (/versionName "([0-9.]+)"/.exec(gradle) || [])[1];
  const prevCode = Number((/versionCode (\d+)/.exec(gradle) || [])[1]);
  const kind = process.env.GATE_KIND === 'minor' ? 'minor' : 'patch';
  const next = G.nextVersion(prev, kind);
  return { last, lastTagIso, changes: G.appChanges(files), prev, prevCode, next, nextCode: prevCode + 1, monthlyOk: G.monthlyOk(lastTagIso) };
}

const mode = process.argv[2];
if (mode === 'plan') console.log(JSON.stringify(plan()));
else if (mode === 'decide') {
  const p = JSON.parse(process.env.GATE_PLAN);
  const gms = process.env.GATE_GMS;
  const d = G.decide({
    changes: p.changes,
    bump: { prev: p.prev, next: process.env.GATE_NEXT_ON_BRANCH || p.next, prevCode: p.prevCode, nextCode: Number(process.env.GATE_NEXTCODE_ON_BRANCH || p.nextCode) },
    lastTagIso: p.lastTagIso, now: new Date(),
    verification: process.env.GATE_VERIFICATION, mobile: process.env.GATE_MOBILE,
    gmsClasses: gms === '' || gms == null ? null : Number(gms),
  });
  console.log(JSON.stringify(d));
} else { console.error('usage: plan|decide'); process.exit(2); }
