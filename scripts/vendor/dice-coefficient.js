/**
 * Sørensen–Dice sur les bigrammes.
 * Repris de dice-coefficient 2.1.1 (Titus Wormer), licence MIT.
 * Le découpage en bigrammes est inclus ici pour ne pas ajouter le paquet n-gram.
 * https://github.com/words/dice-coefficient
 *
 * Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

function bigrams(value) {
  const normal = String(value || '').toLowerCase();
  if (normal.length < 2) return normal ? [normal] : [];
  const pairs = [];
  for (let i = 0; i < normal.length - 1; i++) pairs.push(normal.slice(i, i + 2));
  return pairs;
}

/** Nombre entre 0 (rien en commun) et 1 (identique). */
function diceCoefficient(value, other) {
  const left = bigrams(value);
  const right = bigrams(other);
  if (!left.length || !right.length) return 0;
  let intersections = 0;
  for (let i = 0; i < left.length; i++) {
    const pair = left[i];
    const at = right.indexOf(pair);
    if (at >= 0) {
      intersections++;
      right[at] = '';
    }
  }
  return (2 * intersections) / (left.length + right.length);
}

module.exports = { diceCoefficient };
