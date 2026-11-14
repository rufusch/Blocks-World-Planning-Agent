"""Small symbolic planning domains for the industrial application demos."""

from collections import deque


DOMAINS = {
    "automotive": {
        "name": "Automotive component placement",
        "initial": {"PANEL_AT_STAGING", "CHASSIS_READY", "ROBOT_EMPTY", "CELL_SAFE"},
        "goal": {"PANEL_INSTALLED", "ROBOT_EMPTY"},
        "operators": [
            ("INSPECT_PANEL", {"PANEL_AT_STAGING", "CELL_SAFE"}, {"PANEL_VERIFIED"}, set()),
            ("PICK_PANEL", {"PANEL_AT_STAGING", "PANEL_VERIFIED", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_PANEL"}, {"PANEL_AT_STAGING", "ROBOT_EMPTY"}),
            ("MOVE_TO_CHASSIS", {"ROBOT_HOLDING_PANEL", "CHASSIS_READY", "CELL_SAFE"}, {"PANEL_AT_CHASSIS"}, set()),
            ("ALIGN_PANEL", {"PANEL_AT_CHASSIS", "ROBOT_HOLDING_PANEL"}, {"PANEL_ALIGNED"}, set()),
            ("INSTALL_PANEL", {"PANEL_ALIGNED", "ROBOT_HOLDING_PANEL"}, {"PANEL_INSTALLED", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_PANEL"}),
        ],
    },
    "electronics": {
        "name": "Electronics precision handling",
        "initial": {"PCB_AT_INPUT_TRAY", "FIXTURE_EMPTY", "ROBOT_EMPTY", "CELL_SAFE"},
        "goal": {"PCB_INSPECTED", "PCB_IN_FIXTURE", "ROBOT_EMPTY"},
        "operators": [
            ("LOCATE_PCB", {"PCB_AT_INPUT_TRAY", "CELL_SAFE"}, {"PCB_LOCATED"}, set()),
            ("PICK_PCB", {"PCB_AT_INPUT_TRAY", "PCB_LOCATED", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_PCB"}, {"PCB_AT_INPUT_TRAY", "ROBOT_EMPTY"}),
            ("MOVE_TO_FIXTURE", {"ROBOT_HOLDING_PCB", "FIXTURE_EMPTY"}, {"PCB_AT_FIXTURE"}, set()),
            ("PLACE_PCB", {"PCB_AT_FIXTURE", "ROBOT_HOLDING_PCB"}, {"PCB_IN_FIXTURE", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_PCB", "FIXTURE_EMPTY"}),
            ("INSPECT_ASSEMBLY", {"PCB_IN_FIXTURE", "CELL_SAFE"}, {"PCB_INSPECTED"}, set()),
        ],
    },
    "palletizing": {
        "name": "Logistics case palletizing",
        "initial": {"BOX_AT_CONVEYOR", "PALLET_SLOT_EMPTY", "ROBOT_EMPTY", "CELL_SAFE"},
        "goal": {"BOX_ON_PALLET", "PLACEMENT_VERIFIED", "ROBOT_EMPTY"},
        "operators": [
            ("TRACK_BOX", {"BOX_AT_CONVEYOR", "CELL_SAFE"}, {"BOX_TRACKED"}, set()),
            ("PICK_BOX", {"BOX_AT_CONVEYOR", "BOX_TRACKED", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_BOX"}, {"BOX_AT_CONVEYOR", "ROBOT_EMPTY"}),
            ("MOVE_TO_PALLET", {"ROBOT_HOLDING_BOX", "PALLET_SLOT_EMPTY"}, {"BOX_AT_PALLET"}, set()),
            ("PLACE_BOX", {"BOX_AT_PALLET", "ROBOT_HOLDING_BOX"}, {"BOX_ON_PALLET", "ROBOT_EMPTY"}, {"ROBOT_HOLDING_BOX", "PALLET_SLOT_EMPTY"}),
            ("VERIFY_PLACEMENT", {"BOX_ON_PALLET", "CELL_SAFE"}, {"PLACEMENT_VERIFIED"}, set()),
        ],
    },
}


def solve_application(name):
    """Return a shortest symbolic plan for one application domain."""
    if name not in DOMAINS:
        raise KeyError(name)
    domain = DOMAINS[name]
    start = frozenset(domain["initial"])
    queue = deque([(start, [])])
    seen = {start}
    expanded = 0
    while queue:
        state, plan = queue.popleft()
        if domain["goal"] <= state:
            return {
                "application": name,
                "name": domain["name"],
                "plan": plan,
                "plan_length": len(plan),
                "initial": sorted(domain["initial"]),
                "goal": sorted(domain["goal"]),
                "final": sorted(state),
                "expanded": expanded,
                "verified": True,
            }
        expanded += 1
        for operator, pre, add, delete in domain["operators"]:
            if not pre <= state:
                continue
            successor = frozenset((state - delete) | add)
            if successor in seen:
                continue
            seen.add(successor)
            queue.append((successor, plan + [operator]))
    raise RuntimeError(f"No plan exists for application domain {name}.")
