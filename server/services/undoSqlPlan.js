import mysql from 'mysql2/promise';

// Only application-generated DML is accepted. Unsupported SQL is executed normally,
// but its request cannot advertise an undo that would restore only part of a change.
export const quoteIdentifier = value => {
  if (!/^[A-Za-z_]\w*$/.test(value)) throw new Error('Unsupported SQL identifier');
  return `\`${value}\``;
};

export function maskSqlLiterals(sql) {
  let masked = '';
  let quote = '';
  for (let i = 0; i < sql.length; i++) {
    const character = sql[i];
    if (quote) {
      masked += ' ';
      if (character === '\\') { masked += ' '; i++; }
      else if (character === quote) {
        if (sql[i + 1] === quote) { masked += ' '; i++; }
        else quote = '';
      }
    } else if (character === "'" || character === '"') { quote = character; masked += ' '; }
    else masked += character;
  }
  if (quote) throw new Error('Unterminated SQL literal');
  return masked;
}

function splitExpressions(value) {
  const mask = maskSqlLiterals(value);
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === '(') depth++;
    if (mask[i] === ')') depth--;
    if (mask[i] === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error('Unbalanced SQL expression');
  parts.push(value.slice(start).trim());
  return parts;
}

function isConstantExpression(expression) {
  return /^(?:NULL|TRUE|FALSE|0x[\da-f]+)$/i.test(expression)
    || /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(expression)
    || /^\s*$/.test(maskSqlLiterals(expression));
}

function validateUpsert(rows, assignments, meta) {
  if (assignments.some(part => meta.primaryKey.includes(/^`?([A-Za-z_]\w*)`?\s*=/.exec(part)?.[1]))) throw new Error('Cannot journal changed primary key');
  for (const row of rows) for (const key of meta.uniqueKeys) {
    const complete = key.every(column => row[column]);
    const cannotConflict = key.some(column => /^NULL$/i.test(row[column] || '') || (!row[column] && (meta.autoIncrement?.includes(column) || meta.nullableDefault?.includes(column))));
    if (!complete && !cannotConflict) throw new Error('Unspecified conflicting unique key');
  }
}

function insertSelector(sql, match, meta) {
  const columns = match[1].split(',').map(name => name.trim().replaceAll('`', ''));
  columns.forEach(quoteIdentifier);
  const tail = sql.slice(match[0].length);
  const duplicate = /\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i.exec(maskSqlLiterals(tail));
  const values = duplicate ? tail.slice(0, duplicate.index) : tail;
  const rows = splitExpressions(values).map(row => {
    if (!row.startsWith('(') || !row.endsWith(')')) throw new Error('Unsupported insert');
    const expressions = splitExpressions(row.slice(1, -1));
    if (expressions.length !== columns.length) throw new Error('Unsupported insert');
    return Object.fromEntries(columns.map((column, i) => [column, expressions[i]]));
  });
  if (duplicate) {
    const assignments = splitExpressions(tail.slice(duplicate.index + duplicate[0].length));
    validateUpsert(rows, assignments, meta);
  }
  const selectors = rows.map(row => {
    const keys = meta.uniqueKeys.filter(key => key.every(column => row[column] && !/^NULL$/i.test(row[column])));
    // Explicit inserted values also identify rows when the only key is auto-generated.
    const selected = keys.length ? keys : [columns];
    return selected.map(key => '(' + key.map(column => `${quoteIdentifier(column)} <=> ${row[column]}`).join(' AND ') + ')').join(' OR ');
  });
  // Expressions with side effects, subqueries, or volatile values cannot be replayed as selectors.
  for (const row of rows) for (const expression of Object.values(row)) {
    if (!isConstantExpression(expression)) throw new Error('Unsupported insert expression');
  }
  return selectors.map(selector => `(${selector})`).join(' OR ');
}

export function mutationTable(sql) {
  const prefix = /^\s*(?:UPDATE\s+|DELETE\s+FROM\s+|INSERT(?:\s+IGNORE)?\s+INTO\s+)/i.exec(sql);
  if (!prefix) return null;
  const match = /^`?([a-z_]\w*)`?(?=\s|\()/i.exec(sql.slice(prefix[0].length));
  return match?.[1] || null;
}

export function createUndoSqlPlan(statement, values, meta) {
  const sql = mysql.format(statement, values).trim().replace(/;$/, '');
  const mask = maskSqlLiterals(sql);
  if (/;|--|\/\*|#/.test(mask)) throw new Error('Unsupported SQL structure');
  const table = quoteIdentifier(meta.table);
  const insert = /^INSERT(?:\s+IGNORE)?\s+INTO\s+`?[a-z_]\w*`?\s*\(([^)]+)\)\s*VALUES\s*/i.exec(sql);
  if (insert) return { kind: 'insert', table: meta.table, selector: insertSelector(sql, insert, meta) };
  const update = /^UPDATE\s+`?[a-z_]\w*`?\s+SET\s+/i.exec(mask);
  const remove = /^DELETE\s+FROM\s+`?[a-z_]\w*`?\s*(?=WHERE|$)/i.exec(mask);
  if (!update && !remove) throw new Error('Unsupported mutation');
  const where = /\bWHERE\b/i.exec(mask);
  const tail = where ? sql.slice(where.index + where[0].length).trim() : '1 = 1';
  if (/\b(?:JOIN|SELECT|LIMIT|ORDER|RETURNING)\b/i.test(maskSqlLiterals(tail))) throw new Error('Unsupported mutation predicate');
  if (update) {
    const assignments = splitExpressions(sql.slice(update[0].length, where?.index ?? sql.length));
    const changed = assignments.map(part => /^`?([A-Za-z_]\w*)`?\s*=/.exec(part)?.[1]);
    if (changed.some(column => !column || meta.primaryKey.includes(column))) throw new Error('Cannot journal changed primary key');
  }
  if (!table || !tail) throw new Error('Missing mutation target');
  return { kind: remove ? 'delete' : 'update', table: meta.table, selector: tail };
}
