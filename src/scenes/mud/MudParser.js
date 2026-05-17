/**
 * Parses MUD command input into normalized command objects.
 * Purpose: keep text-command interpretation isolated from scene rendering logic.
 */
export function parseMudCommand(rawInput) {
  const input = String(rawInput || '').trim().toLowerCase();
  if (!input) {
    return { verb: 'empty', args: [] };
  }

  const [verb, ...args] = input.split(/\s+/);

  if (verb === 'go' || verb === 'move') {
    return { verb: 'go', args };
  }

  if (verb === 'take' || verb === 'get') {
    return { verb: 'take', args };
  }

  if (verb === 'inv' || verb === 'inventory') {
    return { verb: 'inventory', args: [] };
  }

  if (verb === 'look' || verb === 'l') {
    return { verb: 'look', args: [] };
  }

  if (verb === 'use') {
    return { verb: 'use', args };
  }

  if (verb === 'flags') {
    return { verb: 'flags', args: [] };
  }

  if (verb === 'complete') {
    return { verb: 'complete', args: [] };
  }

  if (verb === 'help') {
    return { verb: 'help', args: [] };
  }

  return { verb: 'unknown', args: [verb, ...args] };
}
