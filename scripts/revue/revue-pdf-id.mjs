/**
 * Identifiant d'une édition de revue pour les PDF et le flux de travail.
 * « matin » / « soir » (sortie de la porte) se résolvent vers l'édition
 * correspondante déjà écrite, la plus récente selon data/revue/index.json.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listEditionDirs(base) {
  const dir = join(base, 'revues');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    if (!/^\d{4}-\d{2}-\d{2}-(matin|soir)$/.test(name)) return false;
    return existsSync(join(dir, name, 'index.html'));
  });
}

export function resolveEditionId(raw, base) {
  const id = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}-(matin|soir)$/.test(id)) return id;
  if (id === 'matin' || id === 'soir') {
    const indexPath = join(base, 'data/revue/index.json');
    if (existsSync(indexPath)) {
      try {
        const index = JSON.parse(readFileSync(indexPath, 'utf8'));
        const hit = (Array.isArray(index) ? index : []).find(
          (r) => r && r.edition === id && existsSync(join(base, 'revues', r.id, 'index.html')),
        );
        if (hit?.id) return hit.id;
      } catch { /* index illisible : repli sur les dossiers */ }
    }
    const dirs = listEditionDirs(base).filter((name) => name.endsWith(`-${id}`)).sort().reverse();
    if (dirs[0]) return dirs[0];
  }
  return id;
}
