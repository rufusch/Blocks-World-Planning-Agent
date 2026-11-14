"""Breadth-first search for the shortest possible plan (used for comparison)."""

from collections import deque


def _moves(stacks, hold):
    """All states reachable with one operator. stacks = frozenset of tuples."""
    out = []
    if hold is None:                      # PICKUP / UNSTACK the top block
        for s in stacks:
            rest = stacks - {s}
            if len(s) > 1:
                rest = rest | {s[:-1]}
            out.append((frozenset(rest), s[-1]))
    else:                                 # PUTDOWN or STACK the held block
        out.append((stacks | {(hold,)}, None))
        for s in stacks:
            out.append((frozenset((stacks - {s}) | {s + (hold,)}), None))
    return out


def optimal_length(initial, goal, limit=120000):
    """Length of the shortest plan, or None if the search is too large."""
    start = (frozenset(tuple(s) for s in initial), None)
    target = frozenset(tuple(s) for s in goal)
    if start[0] == target:
        return 0
    seen, queue, expanded = {start}, deque([(start, 0)]), 0
    while queue:
        (stacks, hold), d = queue.popleft()
        expanded += 1
        if expanded > limit:
            return None
        for nxt in _moves(stacks, hold):
            if nxt in seen:
                continue
            if nxt[1] is None and nxt[0] == target:
                return d + 1
            seen.add(nxt)
            queue.append((nxt, d + 1))
    return None
