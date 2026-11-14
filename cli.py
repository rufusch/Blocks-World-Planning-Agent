"""Command-line interface for the optimal Blocks World planner."""

from __future__ import annotations

import argparse
import time

from planner.optimal import SearchLimitError, find_optimal_plan
from planner.validation import validate_problem


DEMOS = [
    ("Simple tower", [["A"], ["B"], ["C"]], [["A", "B", "C"]]),
    ("Sussman anomaly", [["A", "C"], ["B"]], [["C", "B", "A"]]),
    ("Reverse four", [["A", "B", "C", "D"]], [["D", "C", "B", "A"]]),
]


def parse_state(text):
    """Parse 'A B | C' into bottom-to-top stacks."""
    stacks = [part.strip().upper().replace(",", " ").split() for part in text.split("|")]
    return [stack for stack in stacks if stack]


def format_state(stacks):
    return " | ".join(" ".join(stack) for stack in stacks)


def run_case(name, initial, goal, max_expansions):
    blocks = sorted(block for stack in initial for block in stack)
    errors = validate_problem(blocks, initial, goal)
    if errors:
        raise ValueError("; ".join(errors))
    started = time.perf_counter()
    plan, stats = find_optimal_plan(initial, goal, max_expansions=max_expansions)
    elapsed_ms = (time.perf_counter() - started) * 1000
    print(f"\n{'=' * 68}\n{name}\n{'=' * 68}")
    print(f"Initial : {format_state(initial)}")
    print(f"Goal    : {format_state(goal)}")
    print(f"Result  : OPTIMAL - {len(plan)} actions")
    print(f"Search  : {stats['expanded']:,} expanded, {stats['frontier_peak']:,} peak frontier, {elapsed_ms:.2f} ms")
    if not plan:
        print("Plan    : already at the goal")
    else:
        print("Plan:")
        for number, action in enumerate(plan, 1):
            print(f"  {number:>2}. {action}")


def main():
    parser = argparse.ArgumentParser(description="Optimal A* Blocks World planner")
    parser.add_argument("--initial", help='Initial stacks, e.g. "A B | C"')
    parser.add_argument("--goal", help='Goal stacks, e.g. "C B A"')
    parser.add_argument("--demo", action="store_true", help="Run the built-in comparison scenarios")
    parser.add_argument("--max-expansions", type=int, default=500_000)
    args = parser.parse_args()
    if args.demo or (args.initial is None and args.goal is None):
        for case in DEMOS:
            run_case(*case, args.max_expansions)
        return
    if not args.initial or not args.goal:
        parser.error("--initial and --goal must be provided together")
    try:
        run_case("Custom problem", parse_state(args.initial), parse_state(args.goal), args.max_expansions)
    except (ValueError, SearchLimitError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
