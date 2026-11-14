"""Flask server for the Blocks World Planning Agent."""

import logging
import os
import time
import uuid

from flask import Flask, jsonify, render_template, request

from planner.applications import DOMAINS, solve_application
from planner.goal_stack import PlanningError, solve as solve_goal_stack
from planner.optimal import SearchLimitError, solve
from planner.validation import validate_problem

app = Flask(__name__, static_folder="public/static", static_url_path="/static", template_folder="templates")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("blocks-world")


@app.route("/")
def index():
    """Serve the public landing page."""
    return render_template("index.html")


@app.route("/planner")
def planner():
    """Serve the interactive planning workspace."""
    return render_template("planner.html")


@app.route("/applications")
def applications():
    """Serve the industrial robot applications page."""
    return render_template("applications.html")


@app.post("/api/solve")
def api_solve():
    """Validate the problem, run optimal A* and return its execution trace."""
    request_id = uuid.uuid4().hex[:12]
    data = request.get_json(silent=True) or {}
    blocks, initial, goal = data.get("blocks"), data.get("initial"), data.get("goal")
    errors = validate_problem(blocks, initial, goal)
    if errors:
        return jsonify(ok=False, code="INVALID_PROBLEM", request_id=request_id, errors=errors), 400
    try:
        requested_limit = int(data.get("max_expansions", 500_000))
    except (TypeError, ValueError):
        requested_limit = 500_000
    max_expansions = max(10_000, min(requested_limit, 1_000_000))
    start = time.perf_counter()
    try:
        result = solve(initial, goal, max_expansions=max_expansions)
    except SearchLimitError as exc:
        logger.warning("request=%s search_limit blocks=%s", request_id, len(blocks))
        return jsonify(ok=False, code="SEARCH_LIMIT", request_id=request_id, errors=[str(exc)]), 422
    elapsed = round((time.perf_counter() - start) * 1000, 2)
    logger.info("request=%s solved blocks=%s actions=%s time_ms=%s", request_id, len(blocks), len(result["plan"]), elapsed)
    return jsonify(ok=True, solved=True, request_id=request_id, time_ms=elapsed,
                   optimal_length=len(result["plan"]),
                   plan_length=len(result["plan"]), **result)


@app.post("/api/compare")
def api_compare():
    """Compare optimal A* with the original Goal Stack Planner."""
    data = request.get_json(silent=True) or {}
    blocks, initial, goal = data.get("blocks"), data.get("initial"), data.get("goal")
    errors = validate_problem(blocks, initial, goal)
    if errors:
        return jsonify(ok=False, errors=errors), 400
    start = time.perf_counter()
    astar = solve(initial, goal)
    astar_ms = (time.perf_counter() - start) * 1000
    try:
        start = time.perf_counter()
        gsp = solve_goal_stack(initial, goal)
        gsp_ms = (time.perf_counter() - start) * 1000
        gsp_result = {"actions": len(gsp["plan"]), "time_ms": round(gsp_ms, 3), "iterations": gsp["iterations"], "status": "solved"}
    except PlanningError as exc:
        gsp_result = {"actions": None, "time_ms": None, "iterations": None, "status": "failed", "error": str(exc)}
    return jsonify(ok=True, astar={"actions": len(astar["plan"]), "time_ms": round(astar_ms, 3), "expanded": astar["search"]["expanded"], "frontier_peak": astar["search"]["frontier_peak"], "status": "optimal"}, goal_stack=gsp_result)


@app.get("/api/applications/<name>/plan")
def api_application_plan(name):
    """Return a verified symbolic plan for an industrial application."""
    if name not in DOMAINS:
        return jsonify(ok=False, code="UNKNOWN_APPLICATION", errors=["Unknown application domain."]), 404
    started = time.perf_counter()
    result = solve_application(name)
    return jsonify(ok=True, time_ms=round((time.perf_counter() - started) * 1000, 3), **result)


@app.get("/api/health")
def api_health():
    return jsonify(ok=True, service="blocks-world-planner", planner="A* (optimal)", applications=sorted(DOMAINS))


if __name__ == "__main__":
    debug = os.environ.get("BLOCKS_WORLD_DEBUG", "1").lower() in {"1", "true", "yes"}
    app.run(debug=debug, host="127.0.0.1", port=int(os.environ.get("BLOCKS_WORLD_PORT", "5050")))
