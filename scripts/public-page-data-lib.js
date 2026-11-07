/** Read Nuxt 2's literal-only IIFE serialization. Never evaluate page JavaScript. */
function readLiteral(text, bindings = Object.create(null), from = 0) {
  let pos = from;
  let nodes = 0;
  const ws = () => { while (/\s/.test(text[pos] || '') && pos < text.length) pos += 1; };
  const identifier = () => {
    const match = /^[A-Za-z_$][\w$]*/.exec(text.slice(pos));
    if (!match) throw new Error(`Expected data identifier at ${pos}`);
    pos += match[0].length;
    return match[0];
  };
  const value = (depth = 0) => {
    ws();
    if (depth > 80 || ++nodes > 100000) throw new Error('Page data exceeds bounds');
    const char = text[pos];
    if (char === '"') {
      const start = pos++;
      while (pos < text.length) {
        if (text[pos] === '\\') { pos += 2; continue; }
        if (text[pos++] === '"') return JSON.parse(text.slice(start, pos));
      }
      throw new Error('Unterminated data string');
    }
    if (char === '[' || char === '{') {
      const object = char === '{';
      const end = object ? '}' : ']';
      const out = object ? Object.create(null) : [];
      pos += 1; ws();
      while (text[pos] !== end) {
        if (object) {
          const key = text[pos] === '"' ? value(depth + 1) : identifier();
          if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe data key');
          ws();
          if (text[pos++] !== ':') throw new Error('Expected data colon');
          out[key] = value(depth + 1);
        } else out.push(value(depth + 1));
        ws();
        if (text[pos] === end) break;
        if (text[pos++] !== ',') throw new Error('Expected data comma');
        ws();
      }
      pos += 1;
      return out;
    }
    const number = /^-?(?:\d+(?:\.\d+)?)(?:e[+-]?\d+)?/i.exec(text.slice(pos));
    if (number) { pos += number[0].length; return Number(number[0]); }
    if (text.startsWith('!0', pos) || text.startsWith('!1', pos)) {
      const out = text[pos + 1] === '0'; pos += 2; return out;
    }
    const key = identifier();
    if (key === 'true') return true;
    if (key === 'false') return false;
    if (key === 'null') return null;
    if (Object.prototype.hasOwnProperty.call(bindings, key)) return bindings[key];
    throw new Error(`Unknown page data reference: ${key}`);
  };
  const result = value();
  return { value: result, end: pos };
}

function parseNuxt2PageData(text) {
  if (String(text).length > 2000000) throw new Error('Page data too large');
  const header = /\(function\(([\w$,]*)\)\{return\s*/.exec(text);
  if (!header) throw new Error('Unsupported Nuxt page data');
  const start = header.index + header[0].length;
  // Find the returned literal's boundary without executing it or resolving references.
  let depth = 0;
  let quoted = false;
  let end = start;
  for (; end < text.length; end += 1) {
    const c = text[end];
    if (quoted) {
      if (c === '\\') end += 1;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth += 1;
    else if ((c === '}' || c === ']') && --depth === 0) { end += 1; break; }
  }
  const invocation = /^\s*;?\}\(/.exec(text.slice(end));
  if (!invocation) throw new Error('Unsupported Nuxt data invocation');
  const argsStart = end + invocation[0].length;
  const close = /\)\)\);?\s*$/.exec(text);
  if (!close || close.index < argsStart) throw new Error('Invalid Nuxt page data ending');
  const argsText = `[${text.slice(argsStart, close.index)}]`;
  const parsedArgs = readLiteral(argsText);
  if (parsedArgs.end !== argsText.length) throw new Error('Unexpected page data arguments');
  const args = parsedArgs.value;
  const names = header[1].split(',');
  if (names.length !== args.length) throw new Error('Nuxt data argument mismatch');
  const bindings = Object.create(null);
  names.forEach((name, i) => { bindings[name] = args[i]; });
  const data = readLiteral(text, bindings, start);
  if (data.end !== end) throw new Error('Unexpected executable page content');
  return data.value;
}
module.exports = { parseNuxt2PageData };
