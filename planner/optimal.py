"""Optimal Blocks World planner using A* search.

The Goal Stack Planner is useful for teaching, but it can repeatedly undo its own
work.  This planner searches complete world states and guarantees a shortest
operator sequence when it returns a result.
"""

from __future__ import annotations

from heapq import heappop, heappush
from itertools import count

from .goal_stack import stacks_to_state
from .operators import apply_operator, pred_str


class SearchLimitError(RuntimeError):
    """Raised when the configured A* expansion limit is exhausted."""


State = tuple[frozenset[tuple[str, ...]], str | None]


def _canonical(stacks, held=None):
    """Create the hashable search representation for a Blocks World state."""
    return frozenset(tuple(stack) for stack in stacks), held


def _support_map(state):
    """Return each block's current support: TABLE, HAND, or another block."""
    stacks, held = state
    support = {}
    for stack in stacks:
        support[stack[0]] = "TABLE"
        for lower, upper in zip(stack, stack[1:]):
            support[upper] = lower
    if held is not None:
        support[held] = "HAND"
    return support


def _heuristic(state, goal_support):
    """Admissible cost: minimum actions needed to correct block supports.

    Moving a placed block to a different support needs at least two operators
    (pick/unstack, then put/stack).  A held block needs at least one.  Clearance
    constraints are deliberately ignored, so this never overestimates.
    """
    current = _support_map(state)
    return sum(
        0 if current[block] == wanted else 1 if current[block] == "HAND" else 2
        for block, wanted in goal_support.items()
    )


def _successors(state):
    """Yield every legal (next_state, operator_text) pair in stable order."""
    stacks, held = state
    ordered = sorted(stacks)
    if held is None:
        for stack in ordered:
            top = stack[-1]
            remaining = stacks - {stack}
            if len(stack) == 1:
                yield (frozenset(remaining), top), f"PICKUP({top})"
            else:
                remaining = remaining | {stack[:-1]}
                yield (frozenset(remaining), top), f"UNSTACK({top},{stack[-2]})"
        return

    yield (stacks | {(held,)}, None), f"PUTDOWN({held})"
    for stack in ordered:
        yield (frozenset((stacks - {stack}) | {stack + (held,)}), None), f"STACK({held},{stack[-1]})"


def _reconstruct(parent, target):
    plan = []
    state = target
    while parent[state] is not None:
        state, action = parent[state]
        plan.append(action)
    plan.reverse()
    return plan


def find_optimal_plan(initial, goal, max_expansions=500_000):
    """Return a shortest plan plus A* search statistics."""
    start = _canonical(initial)
    target_stacks = frozenset(tuple(stack) for stack in goal)
    goal_support = _support_map((target_stacks, None))
    if start == (target_stacks, None):
        return [], {"expanded": 0, "generated": 1, "frontier_peak": 1}

    serial = count()
    frontier = []
    heappush(frontier, (_heuristic(start, goal_support), 0, next(serial), start))
    best_cost = {start: 0}
    parent = {start: None}
    expanded = 0
    generated = 1
    frontier_peak = 1

    while frontier:
        _, cost, _, state = heappop(frontier)
        if cost != best_cost.get(state):
            continue
        if state == (target_stacks, None):
            return _reconstruct(parent, state), {
                "expanded": expanded,
                "generated": generated,
                "frontier_peak": frontier_peak,
            }
        expanded += 1
        if expanded > max_expansions:
            raise SearchLimitError(
                f"A* search exceeded {max_expansions:,} expanded states. "
                "Increase max_expansions for this problem."
            )
        for successor, action in _successors(state):
            next_cost = cost + 1
            if next_cost >= best_cost.get(successor, float("inf")):
                continue
            best_cost[successor] = next_cost
            parent[successor] = (state, action)
            estimate = next_cost + _heuristic(successor, goal_support)
            heappush(frontier, (estimate, next_cost, next(serial), successor))
            generated += 1
        frontier_peak = max(frontier_peak, len(frontier))

    raise RuntimeError("No plan exists for the supplied Blocks World problem.")


def _scene_from_state(state):
    """Convert predicate state to the scene shape used by the web client."""
    holding = next((p[1] for p in state if p[0] == "HOLDING"), None)
    above = {p[2]: p[1] for p in state if p[0] == "ON"}
    stacks = []
    for base in sorted(p[1] for p in state if p[0] == "ONTABLE"):
        stack = [base]
        while stack[-1] in above:
            stack.append(above[stack[-1]])
        stacks.append(stack)
    return {"stacks": stacks, "holding": holding}


def _parse_action(action):
    name, raw_args = action[:-1].split("(", 1)
    return name, tuple(raw_args.split(","))


def solve(initial, goal, max_expansions=500_000):
    """Find an optimal plan and build an action-by-action visualization trace."""
    plan, stats = find_optimal_plan(initial, goal, max_expansions=max_expansions)
    state = stacks_to_state(initial)
    trace = [{
        "iteration": 0,
        "popped": "START",
        "explanation": "A* found a shortest plan. The robot is ready to execute it.",
        "stack": [f"NEXT {action}" for action in reversed(plan)],
        "state": sorted(pred_str(p) for p in state),
        "added": [], "deleted": [], "plan": [], "applied": False,
        "scene": _scene_from_state(state),
    }]
    completed = []
    for index, action in enumerate(plan, 1):
        name, args = _parse_action(action)
        state, added, deleted = apply_operator(state, name, args)
        completed.append(action)
        remaining = plan[index:]
        trace.append({
            "iteration": index,
            "popped": action,
            "explanation": (
                f"Step {index}/{len(plan)}: execute {action}. "
                f"This action lies on an optimal path to the goal."
            ),
            "stack": [f"NEXT {item}" for item in reversed(remaining)],
            "state": sorted(pred_str(p) for p in state),
            "added": sorted(pred_str(p) for p in added),
            "deleted": sorted(pred_str(p) for p in deleted),
            "plan": list(completed), "applied": True,
            "scene": _scene_from_state(state),
        })
    action_duration_ms = {"PICKUP": 900, "PUTDOWN": 850, "STACK": 1100, "UNSTACK": 1050}
    estimated_execution_ms = sum(
        action_duration_ms[action.split("(", 1)[0]] for action in plan
    )
    return {
        "plan": plan,
        "trace": trace,
        "iterations": stats["expanded"],
        "max_stack_depth": stats["frontier_peak"],
        "search": stats,
        "algorithm": "A* (optimal)",
        "estimated_execution_ms": estimated_execution_ms,
    }
