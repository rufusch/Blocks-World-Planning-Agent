"""Checks that a Blocks World problem is well formed."""

MIN_BLOCKS, MAX_BLOCKS = 2, 8


def validate_problem(blocks, initial, goal):
    """Return a list of friendly error messages (empty list = valid).

    A state is a list of stacks; each stack is a list of block names
    from bottom to top, e.g. [["A","B"],["C"]].
    """
    errors = []
    if not isinstance(blocks, list) or not all(isinstance(b, str) for b in blocks):
        return ["The block list is missing or invalid."]
    if not MIN_BLOCKS <= len(blocks) <= MAX_BLOCKS:
        errors.append(f"Use between {MIN_BLOCKS} and {MAX_BLOCKS} blocks.")
    if len(set(blocks)) != len(blocks):
        errors.append("Block names must be unique.")
    for label, cfg in (("Initial", initial), ("Goal", goal)):
        ok = (isinstance(cfg, list) and cfg and
              all(isinstance(s, list) and s and all(isinstance(b, str) for b in s)
                  for s in cfg))
        if not ok:
            errors.append(f"{label} state must be a list of non-empty stacks.")
            continue
        flat = [b for s in cfg for b in s]
        unknown = sorted(set(flat) - set(blocks))
        if unknown:
            errors.append(f"{label} state uses unknown blocks: {', '.join(unknown)}.")
        for b in blocks:
            count = flat.count(b)
            if count == 0:
                errors.append(f"{label} state: block {b} is not placed anywhere.")
            elif count > 1:
                errors.append(f"{label} state: block {b} appears {count} times "
                              "(a block cannot be in two places).")
    return errors
