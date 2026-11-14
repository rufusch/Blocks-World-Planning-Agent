# Blocks World Planning Agent (Optimal A* Search)

Python + Flask backend, plain HTML/CSS/JS frontend. The production planner uses
optimal A* search; the original Goal Stack Planner remains as a teaching and
comparison implementation.

## Run
```
python -m venv venv
venv\Scripts\activate        # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5050

If an older copy is already running, stop it and restart `python app.py` so Flask serves the redesigned interface.

## CLI
Run the built-in scenarios:
```
python cli.py --demo
```

Solve a custom problem (each tower is bottom to top; `|` separates towers):
```
python cli.py --initial "A B | C" --goal "C B A"
```

## Test
```
python -m pytest -q
```

## Files
- `planner/operators.py`  predicates + STACK/UNSTACK/PICKUP/PUTDOWN (precondition, add, delete lists)
- `planner/optimal.py` optimal A* planning and action-by-action trace
- `planner/goal_stack.py` original Goal Stack Planning comparison algorithm
- `planner/validation.py` input checks
- `planner/bfs_optimal.py` shortest plan by breadth-first search (for comparison)
- `app.py` Flask server, endpoint `POST /api/solve`
- `templates/` page layouts for Home, Planner and Applications
- `public/static/` browser scripts, styles, robot artwork and the vendored Three.js runtime

## Interface features
- Articulated 3D industrial robot synchronized to the planner trace
- Inverse-kinematic joint motion, gripper animation, shadows, and orbit controls
- Faster adaptive playback, step controls, and a timeline scrubber
- Live decision, goal-stack, world-state, and plan telemetry
- Automatically persisted block layouts, typed notation, selected scenario, speed, and theme
- Three production simulations at `/applications`: door installation, circuit board assembly, and parcel packing
- Live A* versus Goal Stack Planner comparison analytics
- Search budgets, cancellation, request IDs, health checks, and structured errors
- Expected, measured, and total execution timing
- Camera presets, guarded travel, joint limits, destination markers, and emergency stop

## API endpoints

- `POST /api/solve` — optimal Blocks World plan and execution trace
- `POST /api/compare` — A* and Goal Stack comparison
- `GET /api/applications/<name>/plan` — verified industrial task plan
- `GET /api/health` — service and domain health

See `docs/PROJECT_REPORT.md` for the architecture, algorithm explanation, heuristic justification, test coverage, limitations, and future work. See `docs/DEMO_GUIDE.md` for a presentation sequence.

## How the production planner works
A* searches legal Blocks World states and prioritizes `moves so far + estimated
moves remaining`. The admissible heuristic counts the minimum pickup/unstack and
putdown/stack operations needed to correct every block's support. Because the
heuristic never overestimates, the first returned plan is guaranteed shortest.
# Vercel deployment

Import the project using the Flask preset. The repository root for the deployment is the folder containing `app.py`, `vercel.json`, and `requirements.txt`.

1. Import the Git repository in Vercel, or run `vercel deploy` from this folder with a current Vercel CLI.
2. Use the default build settings and leave the output directory unset. No environment variables are required.
3. Open the preview URL and test `/`, `/planner`, `/applications`, and `/api/health`. Run a planner example and play a production cycle before promoting the deployment.

The Flask instance is exported as `app` from `app.py`. Vercel serves the assets under `public/static/` at `/static/`; Flask serves the same URLs locally. See the [Vercel Flask guide](https://vercel.com/docs/frameworks/backend/flask).

