# Demonstration guide

1. Start the project with `start.bat` and open `http://127.0.0.1:5050`.
2. Load **Sussman Anomaly** and select **Plan and simulate**.
3. Point out the optimal six-action plan, planning time, expanded states, and frontier size.
4. Run the 3D simulation and use the overview, robot, and top camera presets.
5. Show measured execution time and total task time.
6. Explain the A* versus Goal Stack comparison panel.
7. Open `/applications`.
8. Switch between automotive, electronics, and palletizing cells.
9. Show that each cell requests and displays a verified symbolic plan.
10. Demonstrate pause, camera controls, and emergency stop.

## Suggested explanation

“The backend decides what must happen; the 3D engine decides how to present each symbolic action as safe robot motion. Keeping those layers separate makes the plan explainable and testable.”

