// Presentation only: never modify the saved answer or insert markup into it.
export function breathingText(text) {
  return text.split('\n').map(line => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const lines = [];
    let start = 0;
    const boundary = word => {
      if (/[.!?。！？][”’"')\]]?$/.test(word)) return 8;
      if (/[,;:][”’"')\]]?$/.test(word)) return 6;
      if (/(하고|했고|하며|하면서|지만|때문에|바탕으로|통해|위해|맞춰|따라|고려해|비롯해|아니라)$/.test(word)) return 5;
      if (/(을|를)$/.test(word)) return 4;
      if (/(에서|에게|으로|로|은|는|이|가)$/.test(word)) return 2;
      return 0;
    };
    while (start < words.length) {
      let end = start, length = 0, candidate = -1, score = -Infinity;
      for (; end < words.length; end++) {
        length += words[end].length + (end > start ? 1 : 0);
        const weight = boundary(words[end]);
        // Keep Korean dependent constructions together, e.g. "할 수 있습니다".
        const dependent = /^(수|데|것|때|중|줄|지|편|바)([은는이가을를도에]?|입니다\.)$/.test(words[end+1] || '') || /^(수|데|것|할|될|한)$/.test(words[end]);
        if (weight === 8 || (weight === 6 && length >= 4)) { candidate = end; break; }
        const nextWeight = boundary(words[end+1] || '');
        const joinsShortVerb = weight === 4 && (nextWeight === 5 || nextWeight === 6) && length + (words[end+1]?.length || 0) < 30;
        if (!dependent && !joinsShortVerb && length >= 8 && weight >= 4) { candidate = end; break; }
        if (!dependent && length >= 12 && weight === 2 && boundary(words[end+1] || '') < 5) { candidate = end; break; }
        if (!dependent && length >= 10) {
          const value = weight * 3 - Math.abs(19 - length);
          if (value > score) { candidate = end; score = value; }
        }
        if (length >= 28) break;
      }
      if (end >= words.length) candidate = words.length - 1;
      if (candidate < start) candidate = Math.min(end, words.length - 1);
      lines.push(words.slice(start, candidate + 1).join(' '));
      start = candidate + 1;
    }
    return lines.join('\n');
  }).join('\n');
}

// New companies and imports are appended; display newest registration first.
export const newestCompanies = companies => [...companies].reverse();
