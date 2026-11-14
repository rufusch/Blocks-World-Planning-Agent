"""Goal Stack Planning for the Blocks World (all planning happens here)."""

from .operators import apply_operator, get_operator, op_str, pred_str


class PlanningError(Exception):
    """Raised when the planner loops, hits the limit, or cannot find a plan."""


def stacks_to_state(stacks):
    """Convert stacks (bottom->top) into a set of predicates."""
    state = {("ARMEMPTY",)}
    for s in stacks:
        state.add(("ONTABLE", s[0]))
        for lower, upper in zip(s, s[1:]):
            state.add(("ON", upper, lower))
        state.add(("CLEAR", s[-1]))
    return state


def goal_predicates(stacks):
    """The goal is described with ON and ONTABLE predicates."""
    goal = []
    for s in stacks:
        goal.append(("ONTABLE", s[0]))
        goal.extend(("ON", upper, lower) for lower, upper in zip(s, s[1:]))
    return sorted(goal)


def state_to_scene(state):
    """Convert a predicate state back into stacks + held block (for drawing)."""
    holding = next((p[1] for p in state if p[0] == "HOLDING"), None)
    above = {p[2]: p[1] for p in state if p[0] == "ON"}
    stacks = []
    for base in sorted(p[1] for p in state if p[0] == "ONTABLE"):
        s = [base]
        while s[-1] in above:
            s.append(above[s[-1]])
        stacks.append(s)
    return {"stacks": stacks, "holding": holding}


def choose_operator(pred, state):
    """Pick the operator that can make a false predicate true."""
    kind = pred[0]
    if kind == "ON":
        return "STACK", (pred[1], pred[2])
    if kind == "ONTABLE":
        return "PUTDOWN", (pred[1],)
    if kind == "CLEAR":
        x = pred[1]
        if ("HOLDING", x) in state:
            return "PUTDOWN", (x,)
        for q in sorted(state):
            if q[0] == "ON" and q[2] == x:
                return "UNSTACK", (q[1], x)
    if kind == "HOLDING":
        x = pred[1]
        if ("ONTABLE", x) in state:
            return "PICKUP", (x,)
        for q in sorted(state):
            if q[0] == "ON" and q[1] == x:
                return "UNSTACK", (x, q[2])
    if kind == "ARMEMPTY":
        for q in sorted(state):
            if q[0] == "HOLDING":
                return "PUTDOWN", (q[1],)
    raise PlanningError(f"No operator can achieve {pred_str(pred)}.")


def item_str(item):
    """Text for one goal-stack item."""
    if item[0] == "goal":
        return "GOAL[" + " ∧ ".join(pred_str(p) for p in item[1]) + "]"
    if item[0] == "pred":
        return pred_str(item[1])
    return op_str(item[1], item[2])


def solve(initial, goal, max_iterations=2000):
    """Run Goal Stack Planning and return the plan and a full trace."""
    state = stacks_to_state(initial)
    stack = [("goal", tuple(goal_predicates(goal)))]
    plan, trace, seen = [], [], set()
    max_depth = 1

    def snap(it, popped, text, added=(), deleted=(), applied=False):
        trace.append({
            "iteration": it, "popped": popped, "explanation": text,
            "stack": [item_str(i) for i in stack],          # bottom -> top
            "state": sorted(pred_str(p) for p in state),
            "added": sorted(pred_str(p) for p in added),
            "deleted": sorted(pred_str(p) for p in deleted),
            "plan": list(plan), "applied": applied,
            "scene": state_to_scene(state),
        })

    snap(0, "-", "Start: the goal is pushed on the stack and nothing has been done yet.")
    it = 0
    while stack:
        it += 1
        if it > max_iterations:
            raise PlanningError(f"Iteration limit ({max_iterations}) reached; "
                                "the planner may be looping.")
        key = (frozenset(state), tuple(stack))
        if key in seen:
            raise PlanningError("Loop detected: the same state and stack repeated.")
        seen.add(key)

        item = stack.pop()
        popped = item_str(item)
        added, deleted, applied = (), (), False

        if item[0] == "goal":
            unsat = [p for p in item[1] if p not in state]
            if not unsat:
                text = f"Popped {popped}: every part is true, so it is discarded."
            else:
                stack.append(item)
                for p in reversed(unsat):
                    stack.append(("pred", p))
                text = (f"Popped {popped}: not all true yet. Push it back, then push "
                        f"the unsatisfied parts: {', '.join(pred_str(p) for p in unsat)}.")
        elif item[0] == "pred":
            p = item[1]
            if p in state:
                text = f"Popped {popped}: already true in the current state, so discard it."
            else:
                name, args = choose_operator(p, state)
                pre = get_operator(name, args)[0]
                stack.append(("op", name, args))
                stack.append(("goal", tuple(pre)))
                for q in reversed(pre):
                    stack.append(("pred", q))
                text = (f"Popped {popped}: not true, so push {op_str(name, args)} "
                        f"and its preconditions {', '.join(pred_str(q) for q in pre)}.")
        else:
            state, added, deleted = apply_operator(state, item[1], item[2])
            plan.append(op_str(item[1], item[2]))
            applied = True
            text = (f"Popped {popped}: all preconditions hold, so apply it "
                    "(delete list removed, add list inserted) and add it to the plan.")
        max_depth = max(max_depth, len(stack))
        snap(it, popped, text, added, deleted, applied)

    missing = [p for p in goal_predicates(goal) if p not in state]
    if missing:
        raise PlanningError("Planner stopped without reaching the goal.")
    return {"plan": plan, "trace": trace, "iterations": it, "max_stack_depth": max_depth}
