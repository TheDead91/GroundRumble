const SUPPORTED_HEADERS = new Set([
  'name',
  'title',
  'prompt',
  'query',
  'userprompt',
  'systemprompt',
  'context',
  'payload',
  'attack',
  'failkeywords',
  'refusalkeywords',
  'tactic',
  'technique',
  'techniqueid',
  'description',
  'id',
]);

const decodeCsvRow = (line) => {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (quoted) {
      if (character === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      fields.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  fields.push(current);
  return fields;
};

export const decodeCsvRows = (text) => String(text).split(/\r?\n/).map(decodeCsvRow);

export const looksLikeCsv = (text) => {
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  if (!firstLine.includes(',')) return false;

  return decodeCsvRow(firstLine)
    .map((header) => header.trim().toLowerCase().replace(/[^a-z]/g, ''))
    .some((header) => SUPPORTED_HEADERS.has(header));
};
