// "nine thousand nine hundred ninety-nine" → 9999, "two and a half" → 2.5. Returns null if not a number phrase.
const SMALL = { zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD = `(?:${[...Object.keys(SMALL).filter(w => w !== 'a' && w !== 'an'), ...Object.keys(TENS), 'hundred', 'thousand'].join('|')})`;
export const NUMBER_WORDS = `(?:${WORD}(?:(?:[\\s-]+|\\s+and\\s+)${WORD})*(?:\\s+and\\s+a\\s+half)?|an?(?=\\s+(?:hour|day|week|month|year)s?\\b))`;
export function wordsToNumber(phrase) {
  let total = 0; let current = 0; let seen = false;
  const tokens = String(phrase).toLowerCase().replace(/\band a half\b/, ' half').split(/[\s-]+/).filter(t => t && t !== 'and');
  for (const t of tokens) {
    if (t === 'half') { current += 0.5; seen = true; } else if (t in SMALL) { current += SMALL[t]; seen = true; } else if (t in TENS) { current += TENS[t]; seen = true; }
    else if (t === 'hundred') { current = (current || 1) * 100; seen = true; } else if (t === 'thousand') { total += (current || 1) * 1000; current = 0; seen = true; } else return null;
  }
  return seen ? total + current : null;
}
