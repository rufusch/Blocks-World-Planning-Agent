import { FactoryScene } from "./factory.js?v=3";

const scenarios = {
  automotive: {
    title: "Door installation",
    description: "A finished door transfers from the parts conveyor to an indexed vehicle body.",
    labels: ["Index the lines", "Grip the door", "Lift and transfer", "Align to the opening", "Seat the door"],
  },
  electronics: {
    title: "Circuit board assembly",
    description: "A populated circuit board travels from its carrier into a machined enclosure.",
    labels: ["Index the carrier", "Grip the board", "Transfer above the enclosure", "Seat the board", "Send the assembly onward"],
  },
  palletizing: {
    title: "Parcel packing",
    description: "The arm transfers a labelled parcel from the infeed to a shipping tote.",
    labels: ["Index the parcel", "Grip the parcel", "Transfer above the tote", "Place the parcel", "Send the tote onward"],
  },
};

const byId = id => document.getElementById(id);
const saved = (key, fallback) => localStorage.getItem(key) || fallback;
const remember = (key, value) => localStorage.setItem(key, value);
const play = byId("run-application");
const restart = byId("restart-application");
const stop = byId("estop-application");
const speed = byId("cycle-speed");
const camera = byId("camera");
const status = byId("cell-status-text");
const stage = byId("applications-scene");
const trace = byId("application-plan");
const scenarioButtons = [...document.querySelectorAll("[data-scenario]")];
let workcell, selected, planRequest, stageIndex = -1;
let running = false, stopped = false, ready = false, completed = false;
let elapsed = 0, playback = 0, cycles = 0, previousFrame = 0, frameId = 0;

function pause() {
  running = false;
  cancelAnimationFrame(frameId);
}

function syncControls() {
  play.disabled = !ready || stopped || !workcell;
  restart.disabled = !ready || !workcell;
  stop.disabled = !running;
  play.textContent = running ? "Pause" : completed ? "Play again" : elapsed ? "Resume" : "Play";
}

function draw() {
  const index = workcell.renderCycle(elapsed);
  byId("execution-time").textContent = `${(elapsed / 1000).toFixed(1)} s`;
  byId("playback-time").textContent = `${(playback / 1000).toFixed(1)} s`;
  if (index === stageIndex) return;
  stageIndex = index;
  [...trace.children].forEach((item, step) => {
    if (step === index) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  if (running) status.textContent = scenarios[selected].labels[index];
}

function reset() {
  pause();
  stopped = completed = false;
  elapsed = playback = previousFrame = 0;
  stageIndex = -1;
  if (workcell) draw();
  syncControls();
}

function frame(now) {
  if (!running) return;
  const delta = previousFrame ? Math.min(now - previousFrame, 100) : 0;
  const rate = Number(speed.value);
  previousFrame = now;
  playback += Math.min(delta, (workcell.duration - elapsed) / rate);
  elapsed = Math.min(workcell.duration, elapsed + delta * rate);
  draw();
  if (elapsed < workcell.duration) {
    frameId = requestAnimationFrame(frame);
    return;
  }
  running = false;
  completed = true;
  byId("cycle-count").textContent = String(++cycles);
  status.textContent = "Cycle complete";
  syncControls();
}

function start() {
  if (running || !ready || stopped || !workcell) return;
  if (completed) reset();
  running = true;
  previousFrame = 0;
  status.textContent = scenarios[selected].labels[stageIndex];
  syncControls();
  frameId = requestAnimationFrame(frame);
}

async function select(name) {
  planRequest?.abort();
  const request = new AbortController();
  planRequest = request;
  selected = name;
  ready = false;
  cycles = 0;
  const scenario = scenarios[name];
  remember("bw-factory-scenario", name);
  for (const button of scenarioButtons) button.setAttribute("aria-pressed", String(button.dataset.scenario === name));
  byId("application-title").textContent = scenario.title;
  byId("application-description").textContent = scenario.description;
  byId("cycle-count").textContent = "0";
  byId("planning-time").textContent = "—";
  trace.replaceChildren();
  workcell?.load(name);
  reset();
  status.textContent = "Planning the task…";
  try {
    const response = await fetch(`/api/applications/${name}/plan`, { signal: request.signal });
    const data = await response.json();
    if (!response.ok || !data.verified || data.plan.length !== scenario.labels.length) throw new Error("Invalid task plan");
    if (request.signal.aborted) return;
    for (const [index, operator] of data.plan.entries()) {
      const item = document.createElement("li");
      item.textContent = scenario.labels[index];
      item.title = operator;
      trace.append(item);
    }
    byId("planning-time").textContent = `${data.time_ms.toFixed(3)} ms`;
    ready = true;
    stageIndex = -1;
    if (workcell) draw();
    status.textContent = workcell ? "Select Play to start the cycle." : "The task plan is available below.";
  } catch {
    if (request.signal.aborted) return;
    status.textContent = "The planner could not load. Select the scenario to retry.";
  }
  syncControls();
}

function restoreChoice(input, key) {
  const value = saved(key, input.value);
  if ([...input.options].some(option => option.value === value)) input.value = value;
}

try {
  workcell = new FactoryScene(stage);
} catch {
  const message = document.createElement("p");
  message.textContent = "The 3D workcell needs a browser with WebGL support.";
  stage.replaceChildren(message);
  camera.disabled = speed.disabled = true;
}
restoreChoice(speed, "bw-factory-speed");
restoreChoice(camera, "bw-factory-camera");
workcell?.setCameraPreset(camera.value);
speed.onchange = () => remember("bw-factory-speed", speed.value);
camera.onchange = () => {
  remember("bw-factory-camera", camera.value);
  workcell?.setCameraPreset(camera.value);
};
play.onclick = () => {
  if (!running) return start();
  pause();
  status.textContent = "Paused";
  syncControls();
};
restart.onclick = () => { reset(); start(); };
stop.onclick = () => {
  pause();
  stopped = true;
  status.textContent = "Simulation stopped. Select Restart to begin a new cycle.";
  syncControls();
};
for (const button of scenarioButtons) button.onclick = () => select(button.dataset.scenario);
const theme = byId("theme");
function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  theme.textContent = value === "dark" ? "Light mode" : "Dark mode";
}
applyTheme(saved("bw-theme", "light"));
theme.onclick = () => {
  const value = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(value);
  remember("bw-theme", value);
};
const initial = saved("bw-factory-scenario", "automotive");
select(Object.hasOwn(scenarios, initial) ? initial : "automotive");
