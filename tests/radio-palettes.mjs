import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {radioPalette,radioPaletteAttrs}=require('../scripts/radio-palette-lib');
const radios=require('../radios.json');const brands=require('../brand-colors.json').institutions;
const names={cfak:'Université de Sherbrooke',choq:'Université du Québec à Montréal',chyz:'Université Laval',cism:'Université de Montréal',cjlo:'Concordia University',ckut:'McGill University'};
for(const [id,name] of Object.entries(names)) {
 assert.equal(radios.find(r=>r.id===id).institution,name);
 const p=radioPalette(id);assert(p);assert.equal(p.primary,brands[id==='choq'?'UQAM':name].color);
 for(const k of ['primary','variant','companion'])assert.match(p[k],/^#[0-9a-f]{6}$/i);
 assert.match(radioPaletteAttrs(id),/data-radio-institution=/);
}
assert.equal(radioPalette('unknown'),null);assert.equal(radioPaletteAttrs('unknown'),'');
assert.notEqual(radioPalette('chyz').variant,radioPalette('ckut').variant);
assert.notEqual(radioPalette('choq').variant,radioPalette('cism').variant);
console.log('Radio palettes: six actual affiliations reuse official existing tokens; distinct sourced variants, safe unknowns.');
