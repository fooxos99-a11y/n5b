'use strict';

const MAX_DEPTH = 128;

const assertDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new SyntaxError(`Brace pattern exceeds maximum nesting depth (${MAX_DEPTH})`);
    error.code = 'ERR_BRACES_DEPTH';
    throw error;
  }
};

// Inspect only child edges; parsed ASTs also contain parent/previous references.
const assertAstDepth = ast => {
  const pending = [[ast, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop();
    assertDepth(depth);
    if (node && Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};

module.exports = { assertDepth, assertAstDepth };
