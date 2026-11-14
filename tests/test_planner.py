import pytest
from planner.bfs_optimal import optimal_length
from planner.goal_stack import PlanningError, goal_predicates, solve, stacks_to_state
from planner.operators import apply_operator
from planner.applications import DOMAINS, solve_application
from planner.optimal import find_optimal_plan, solve as solve_optimal
from planner.validation import validate_problem


def replay(initial, goal, plan):
    """Run the plan from the initial state and check the goal is reached."""
    state = stacks_to_state(initial)
    for step in plan:
        name, args = step.rstrip(")").split("(")
        state, _, _ = apply_operator(state, name, tuple(args.split(",")))
    return all(p in state for p in goal_predicates(goal))


def check(initial, goal):
    res = solve(initial, goal)
    assert replay(initial, goal, res["plan"])
    return res


def test_already_solved():
    assert check([["A", "B"]], [["A", "B"]])["plan"] == []


def test_single_move():
    assert check([["A"], ["B"]], [["A", "B"]])["plan"] == ["PICKUP(B)", "STACK(B,A)"]


def test_reverse_tower():
    check([["A", "B", "C", "D"]], [["D", "C", "B", "A"]])


def test_sussman_anomaly():
    res = check([["A", "C"], ["B"]], [["C", "B", "A"]])
    assert optimal_length([["A", "C"], ["B"]], [["C", "B", "A"]]) == 6
    assert len(res["plan"]) >= 6


def test_eight_blocks():
    blocks = list("ABCDEFGH")
    check([[b] for b in blocks], [blocks])
    check([blocks], [blocks[::-1]])


def test_invalid_input():
    assert validate_problem(["A", "B"], [["A"]], [["A", "B"]])
    assert validate_problem(["A", "B"], [["A", "A"], ["B"]], [["A", "B"]])
    assert validate_problem(["A"], [["A"]], [["A"]])
    assert not validate_problem(["A", "B"], [["A"], ["B"]], [["A", "B"]])


def test_iteration_limit():
    with pytest.raises(PlanningError):
        solve([["A", "B", "C", "D"]], [["D", "C", "B", "A"]], max_iterations=3)


def test_gsp_never_shorter_than_optimal():
    init, goal = [["A", "B"], ["C", "D"]], [["D", "A"], ["B", "C"]]
    assert len(check(init, goal)["plan"]) >= optimal_length(init, goal)


def test_astar_returns_shortest_sussman_plan():
    initial, goal = [["A", "C"], ["B"]], [["C", "B", "A"]]
    plan, stats = find_optimal_plan(initial, goal)
    assert len(plan) == 6
    assert replay(initial, goal, plan)
    assert stats["expanded"] > 0


def test_astar_avoids_goal_stack_rework():
    initial = [["A", "B", "C", "D"]]
    goal = [["D", "C", "B", "A"]]
    optimal_plan, _ = find_optimal_plan(initial, goal)
    gsp_plan = solve(initial, goal)["plan"]
    assert len(optimal_plan) == 8
    assert len(optimal_plan) < len(gsp_plan)
    assert replay(initial, goal, optimal_plan)


def test_optimal_web_trace_replays_every_action():
    result = solve_optimal([["A"], ["B"], ["C"]], [["A", "B", "C"]])
    assert result["algorithm"] == "A* (optimal)"
    assert result["estimated_execution_ms"] == 4000
    assert len(result["trace"]) == len(result["plan"]) + 1
    assert replay([["A"], ["B"], ["C"]], [["A", "B", "C"]], result["plan"])


def test_site_pages_and_3d_engine_are_served():
    from app import app
    client = app.test_client()
    assert client.get("/").status_code == 200
    assert client.get("/applications").status_code == 200
    assert client.get("/static/robot3d.js").status_code == 200
    assert client.get("/static/vendor/three/three.module.min.js").status_code == 200


def test_all_application_domains_return_verified_shortest_plans():
    for name in DOMAINS:
        result = solve_application(name)
        assert result["verified"] is True
        assert result["plan"]
        assert set(result["goal"]) <= set(result["final"])


def test_comparison_and_application_apis():
    from app import app
    client = app.test_client()
    problem = {"blocks": ["A", "B", "C"], "initial": [["A", "C"], ["B"]], "goal": [["C", "B", "A"]]}
    comparison = client.post("/api/compare", json=problem)
    assert comparison.status_code == 200
    assert comparison.json["astar"]["actions"] == 6
    for name in DOMAINS:
        response = client.get(f"/api/applications/{name}/plan")
        assert response.status_code == 200
        assert response.json["verified"] is True


def test_solve_api_clamps_invalid_search_budget():
    from app import app
    client = app.test_client()
    response = client.post("/api/solve", json={"blocks": ["A", "B"], "initial": [["A"], ["B"]], "goal": [["A", "B"]], "max_expansions": "invalid"})
    assert response.status_code == 200
    assert response.json["request_id"]
