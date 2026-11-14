"""Predicates and operators of the Blocks World.

A predicate is a tuple, for example ("ON", "A", "B") or ("ARMEMPTY",).
A state is a Python set of predicates.
"""


def pred_str(p):
    """Turn a predicate tuple into text, e.g. ('ON','A','B') -> 'ON(A,B)'."""
    return p[0] if len(p) == 1 else f"{p[0]}({','.join(p[1:])})"


def op_str(name, args):
    """Turn an operator into text, e.g. ('STACK', ('A','B')) -> 'STACK(A,B)'."""
    return f"{name}({','.join(args)})"


def get_operator(name, args):
    """Return (preconditions, add list, delete list) for an operator."""
    if name == "STACK":
        x, y = args
        return ([("CLEAR", y), ("HOLDING", x)],
                [("ARMEMPTY",), ("ON", x, y), ("CLEAR", x)],
                [("CLEAR", y), ("HOLDING", x)])
    if name == "UNSTACK":
        x, y = args
        return ([("ON", x, y), ("CLEAR", x), ("ARMEMPTY",)],
                [("HOLDING", x), ("CLEAR", y)],
                [("ON", x, y), ("ARMEMPTY",), ("CLEAR", x)])
    if name == "PICKUP":
        (x,) = args
        return ([("ONTABLE", x), ("CLEAR", x), ("ARMEMPTY",)],
                [("HOLDING", x)],
                [("ONTABLE", x), ("CLEAR", x), ("ARMEMPTY",)])
    if name == "PUTDOWN":
        (x,) = args
        return ([("HOLDING", x)],
                [("ONTABLE", x), ("CLEAR", x), ("ARMEMPTY",)],
                [("HOLDING", x)])
    raise ValueError(f"Unknown operator {name}")


def apply_operator(state, name, args):
    """Apply an operator: remove the delete list, then add the add list.

    Raises ValueError if a precondition is not true in the state.
    Returns (new_state, add_list, delete_list).
    """
    pre, add, delete = get_operator(name, args)
    missing = [pred_str(p) for p in pre if p not in state]
    if missing:
        raise ValueError(f"{op_str(name, args)} not applicable, missing {missing}")
    return (state - set(delete)) | set(add), add, delete
