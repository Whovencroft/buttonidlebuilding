"""
Dead-end branch audit using the addGraphNode/addGraphEdge design graph.

For each level:
1. Parse all graph nodes and directed edges
2. Forward BFS from 'start' node  → set F (nodes reachable from start)
3. Reverse BFS from 'goal' node   → set R (nodes that can reach goal)
4. Dead-end nodes = F - R (reachable from start but cannot reach goal)
5. Report any dead-end nodes

This is Z-aware because the graph edges encode ramp/descent transitions.
"""

import re
from collections import deque, defaultdict

LEVELS_FILE = '/home/ubuntu/buttonidlebuilding/js/scenes/marble/marble_levels.js'

with open(LEVELS_FILE, 'r') as f:
    src = f.read()
lines_src = src.split('\n')

# ── Find registered level builders ────────────────────────────────────────
registered_pat = re.compile(r'const LEVELS = \[([^\]]+)\]', re.DOTALL)
m = registered_pat.search(src)
if not m:
    raise RuntimeError('Could not find LEVELS array')
call_pat = re.compile(r'(build\w+)\s*\(')
registered_builders = call_pat.findall(m.group(1))

# ── Find line ranges for each registered builder ───────────────────────────
builder_lines = {}
for match in re.finditer(r'function\s+(build\w+)\s*\(', src):
    name = match.group(1)
    if name in registered_builders:
        builder_lines[name] = src[:match.start()].count('\n') + 1

ordered = sorted([(name, builder_lines[name]) for name in registered_builders
                  if name in builder_lines], key=lambda x: x[1])

level_ranges = []
for i, (name, start_line) in enumerate(ordered):
    end_line = ordered[i+1][1] - 1 if i+1 < len(ordered) else len(lines_src)
    level_ranges.append((name, start_line, end_line))

# ── Patterns ───────────────────────────────────────────────────────────────
node_pat = re.compile(
    r"addGraphNode\s*\([^,]+,\s*\{[^}]*id\s*:\s*'([^']+)'[^}]*type\s*:\s*'([^']+)'",
    re.DOTALL
)
# Also catch type before id
node_pat2 = re.compile(
    r"addGraphNode\s*\([^,]+,\s*\{[^}]*type\s*:\s*'([^']+)'[^}]*id\s*:\s*'([^']+)'",
    re.DOTALL
)
edge_pat = re.compile(
    r"addGraphEdge\s*\([^,]+,\s*\{[^}]*from\s*:\s*'([^']+)'[^}]*to\s*:\s*'([^']+)'",
    re.DOTALL
)

# ── BFS helpers ────────────────────────────────────────────────────────────

def forward_bfs(start_id, adj):
    """BFS following directed edges forward."""
    visited = set()
    q = deque([start_id])
    visited.add(start_id)
    while q:
        node = q.popleft()
        for neighbor in adj.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                q.append(neighbor)
    return visited

def reverse_bfs(goal_id, radj):
    """BFS following directed edges in reverse (who can reach goal?)."""
    visited = set()
    q = deque([goal_id])
    visited.add(goal_id)
    while q:
        node = q.popleft()
        for neighbor in radj.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                q.append(neighbor)
    return visited

# ── Main audit ─────────────────────────────────────────────────────────────

print("=" * 65)
print("DEAD-END BRANCH AUDIT (graph node/edge connectivity)")
print("=" * 65)

total_issues = 0
all_ok = True

for level_name, start_line, end_line in level_ranges:
    level_src = '\n'.join(lines_src[start_line-1:end_line])

    # Parse nodes
    nodes = {}
    for match in node_pat.finditer(level_src):
        nid, ntype = match.group(1), match.group(2)
        nodes[nid] = ntype
    for match in node_pat2.finditer(level_src):
        ntype, nid = match.group(1), match.group(2)
        if nid not in nodes:
            nodes[nid] = ntype

    # Parse edges
    adj  = defaultdict(list)  # forward: from -> [to]
    radj = defaultdict(list)  # reverse: to -> [from]
    for match in edge_pat.finditer(level_src):
        frm, to = match.group(1), match.group(2)
        adj[frm].append(to)
        radj[to].append(frm)
        # Ensure both nodes exist even if not explicitly declared
        if frm not in nodes:
            nodes[frm] = 'unknown'
        if to not in nodes:
            nodes[to] = 'unknown'

    if not nodes:
        print(f"  SKIP: {level_name} — no graph nodes found")
        continue

    # Find start and goal nodes
    start_nodes = [nid for nid, ntype in nodes.items() if ntype == 'entry']
    goal_nodes  = [nid for nid, ntype in nodes.items() if ntype == 'goal']

    if not start_nodes:
        print(f"  WARN: {level_name} — no 'entry' type node found")
        continue
    if not goal_nodes:
        print(f"  WARN: {level_name} — no 'goal' type node found")
        continue

    start_id = start_nodes[0]
    goal_id  = goal_nodes[-1]  # use last goal node (some levels have intermediate goals)

    F = forward_bfs(start_id, adj)
    R = reverse_bfs(goal_id, radj)

    dead = F - R
    # Remove self-loops on goal (finale edges)
    dead.discard(goal_id)

    if dead:
        all_ok = False
        total_issues += len(dead)
        print(f"  FAIL: {level_name}")
        print(f"        Nodes: {len(nodes)}, Reachable from start: {len(F)}, Can reach goal: {len(R)}")
        print(f"        Dead-end nodes ({len(dead)}): {sorted(dead)}")
        # Show what edges these dead-end nodes have
        for dn in sorted(dead):
            out_edges = adj.get(dn, [])
            in_edges  = [k for k, vs in adj.items() if dn in vs]
            print(f"          '{dn}' (type={nodes.get(dn,'?')}) in={in_edges} out={out_edges}")
    else:
        print(f"  OK:   {level_name}  ({len(nodes)} nodes, all paths reach goal)")

print()
print("=" * 65)
if all_ok:
    print("ALL LEVELS PASS: Every graph node can reach the goal.")
else:
    print(f"ISSUES: {total_issues} dead-end node(s) found. These are paths")
    print("        reachable from start that have no route to the goal.")
