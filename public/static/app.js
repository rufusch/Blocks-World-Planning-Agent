/* Planning happens on the Flask server. This file edits, persists and animates its trace. */
window.BLOCKS_WORLD_APP_LOADED = true;
const COLORS = ["#287df0", "#ee5261", "#f4a83c", "#16ae83", "#8a5cf5", "#12a8c7", "#e867ad", "#6ca33c"];
const PRESETS = [
  {name:"Simple 3-block swap", desc:"Swap the order of two stacked blocks.", blocks:3, initial:[["A","B"],["C"]], goal:[["B","A"],["C"]]},
  {name:"Reverse a tower", desc:"Turn a four-block tower upside down.", blocks:4, initial:[["A","B","C","D"]], goal:[["D","C","B","A"]]},
  {name:"Sussman Anomaly", desc:"The classic interacting-subgoals problem.", blocks:3, initial:[["A","C"],["B"]], goal:[["C","B","A"]]},
  {name:"4-block rearrangement", desc:"Rebuild two towers in a new order.", blocks:4, initial:[["A","B"],["C","D"]], goal:[["D","A"],["B","C"]]},
];
const WORKSPACE_KEY = "roboplan-workspace-v2";
const SAVED_KEY = "bw-saved";
const SPEEDS = ["0.5×", "0.8×", "1.0×", "1.5×", "2.0×"];
const $ = selector => document.querySelector(selector);
const clone = value => JSON.parse(JSON.stringify(value));
const mk = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };

let blocks = [];
let cfg = {initial:[], goal:[]};
let drafts = {initial:"", goal:""};
let result = null;
let idx = 0;
let timer = null;
let executionStartedAt = 0;
let executionElapsedMs = 0;
let els = {};
let robot = {};
let robot3D = null;
let pendingScene = null;
let lastX = {};
let selectedPreset = "";
let selectedSaved = "";
let saveFlashTimer = null;
let solveController = null;
const BASE = 54;
const LVL = 45;
const BLOCK_W = 46;
const SCENE_H = 390;

function blockEl(name, className = "block") {
  const el = mk("div", className, name);
  const color = COLORS[blocks.indexOf(name) % COLORS.length];
  el.style.background = `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 72%, #06111c))`;
  el.style.setProperty("--block-color", color);
  return el;
}
const toText = state => state.map(stack => stack.join(" ")).join(" | ");
const parseText = text => text.split("|").map(s => s.trim().split(/[\s,]+/).filter(Boolean).map(x => x.toUpperCase())).filter(s => s.length);
const flat = state => state.flat();
function validLocalState(state) { const values = flat(state); return state.length && values.length === blocks.length && new Set(values).size === blocks.length && values.every(b => blocks.includes(b)); }
function showErrors(messages) { const box = $("#errors"); box.innerHTML = ""; messages.forEach(message => box.appendChild(mk("div", "", message))); }

function setBlocks(count) { blocks = "ABCDEFGH".slice(0, count).split(""); $("#n-blocks").value = String(count); }
function defaultCfg() { cfg.initial = blocks.map(b => [b]); cfg.goal = [[...blocks]]; drafts.initial = toText(cfg.initial); drafts.goal = toText(cfg.goal); }
function randomState() {
  const shuffled = [...blocks];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const state = [];
  shuffled.forEach(block => { if (!state.length || Math.random() < .42) state.push([block]); else state[Math.floor(Math.random() * state.length)].push(block); });
  return state;
}

function flashSaved() {
  const el = $("#autosave");
  el.classList.add("saving"); el.lastChild.textContent = " Saving…";
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(() => { el.classList.remove("saving"); el.lastChild.textContent = " Workspace saved"; }, 350);
}
function saveWorkspace() {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify({version:3,count:blocks.length, cfg, drafts, selectedPreset, selectedSaved, speed:$("#speed")?.value || "4", maxExpansions:$("#max-expansions")?.value || "500000"}));
  flashSaved();
}
function restoreWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "null");
    if (!saved || saved.count < 2 || saved.count > 8) return false;
    setBlocks(saved.count);
    if (!saved.cfg || !validLocalState(saved.cfg.initial) || !validLocalState(saved.cfg.goal)) return false;
    cfg = clone(saved.cfg);
    drafts = {initial:saved.drafts?.initial || toText(cfg.initial), goal:saved.drafts?.goal || toText(cfg.goal)};
    selectedPreset = saved.selectedPreset ?? "";
    selectedSaved = saved.selectedSaved ?? "";
    $("#speed").value = saved.speed || "4";
    $("#max-expansions").value = saved.maxExpansions || "500000";
    return true;
  } catch { return false; }
}
function loadProblem(problem, presetValue = "") {
  stop(); setBlocks(problem.blocks); cfg.initial = clone(problem.initial); cfg.goal = clone(problem.goal);
  drafts.initial = toText(cfg.initial); drafts.goal = toText(cfg.goal);
  selectedPreset = presetValue; selectedSaved = "";
  $("#preset").value = selectedPreset; $("#saved").value = "";
  renderEditors(); hideResult(); showErrors([]); saveWorkspace();
}

function renderEditors(options = {}) { renderEditor("initial", options); renderEditor("goal", options); }
function renderEditor(kind, {syncText = true} = {}) {
  const box = $(`#${kind}-editor`); box.innerHTML = "";
  cfg[kind].forEach((stack, stackIndex) => {
    const column = mk("div", "col");
    stack.forEach((block, blockIndex) => {
      const el = blockEl(block);
      if (blockIndex === stack.length - 1) {
        el.draggable = true;
        el.ondragstart = event => event.dataTransfer.setData("text/plain", JSON.stringify({kind, stackIndex}));
      }
      column.appendChild(el);
    });
    column.ondragover = event => { event.preventDefault(); column.classList.add("drag-target"); };
    column.ondragleave = () => column.classList.remove("drag-target");
    column.ondrop = event => drop(event, kind, stackIndex);
    box.appendChild(column);
  });
  const newColumn = mk("div", "col newcol", "+ NEW TOWER");
  newColumn.ondragover = event => { event.preventDefault(); newColumn.classList.add("drag-target"); };
  newColumn.ondragleave = () => newColumn.classList.remove("drag-target");
  newColumn.ondrop = event => drop(event, kind, -1);
  box.appendChild(newColumn);
  if (syncText) { drafts[kind] = toText(cfg[kind]); $(`#${kind}-text`).value = drafts[kind]; }
}
function drop(event, kind, targetIndex) {
  event.preventDefault();
  let data; try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
  if (data.kind !== kind) return;
  const source = cfg[kind][data.stackIndex]; const block = source?.at(-1); if (!block) return;
  const target = targetIndex === -1 ? [] : cfg[kind][targetIndex];
  if (targetIndex === -1) cfg[kind].push(target);
  source.pop(); target.push(block); cfg[kind] = cfg[kind].filter(stack => stack.length);
  selectedPreset = ""; selectedSaved = ""; $("#preset").value = ""; $("#saved").value = "";
  renderEditor(kind); hideResult(); saveWorkspace();
}
function handleTextInput(kind, event) {
  drafts[kind] = event.target.value;
  const parsed = parseText(drafts[kind]);
  if (validLocalState(parsed)) {
    cfg[kind] = parsed; selectedPreset = ""; selectedSaved = "";
    $("#preset").value = ""; $("#saved").value = "";
    renderEditor(kind, {syncText:false}); hideResult(); showErrors([]);
  }
  saveWorkspace();
}

async function solve() {
  stop(); showErrors([]); solveController?.abort(); solveController = new AbortController(); $("#solve").disabled = true; $("#cancel-solve").hidden = false; $("#solve").innerHTML = '<span class="solve-icon">◌</span> Planning…';
  try {
    const response = await fetch("/api/solve", {method:"POST", headers:{"Content-Type":"application/json"}, signal:solveController.signal, body:JSON.stringify({blocks, initial:cfg.initial, goal:cfg.goal, max_expansions:Number($("#max-expansions").value)})});
    const data = await response.json();
    if (!data.ok) { showErrors(data.errors || ["The planner could not solve this configuration."]); hideResult(); return; }
    result = data; showResult();
  } catch (error) { if (error.name !== "AbortError") showErrors(["Cannot reach the planner server. Make sure the Flask app is running."]); else showErrors(["Planning request cancelled."]); }
  finally { solveController = null; $("#solve").disabled = false; $("#cancel-solve").hidden = true; $("#solve").innerHTML = '<span class="solve-icon">▶</span> Build &amp; simulate plan'; }
}
function hideResult() { $("#result").hidden = true; $("#empty").hidden = false; result = null; }
function showResult() {
  $("#empty").hidden = true; $("#result").hidden = false;
  const stats = [[result.algorithm || "A* (optimal)","Planning algorithm"],[result.plan_length,"Actions in shortest plan"],[`${Number(result.time_ms).toFixed(2)} ms`,"Time taken to plan"],[result.search.expanded.toLocaleString(),"States expanded"],[result.search.frontier_peak.toLocaleString(),"Peak frontier"],[formatDuration(result.estimated_execution_ms),"Expected execution"],["Not run","Measured execution"],["Not run","Total task time"]];
  const summary = $("#summary"); summary.innerHTML = "";
  stats.forEach(([value,label], position) => { const card = mk("div",position >= 6 ? "stat execution-stat" : "stat"); const number = mk("b",position >= 6 ? "pending" : "",value); if (position === 6) number.id = "execution-time-value"; if (position === 7) number.id = "total-time-value"; card.append(number,mk("span","",label)); summary.appendChild(card); });
  buildScene(); lastX = {}; idx = 0; executionStartedAt = 0; executionElapsedMs = 0;
  $("#timeline").max = String(Math.max(0, result.trace.length - 1)); $("#plan-count").textContent = `${result.plan_length} actions`;
  goTo(0, false); renderComparison(); $("#result").scrollIntoView({behavior:"smooth",block:"start"});
}

async function renderComparison() {
  const panel = $("#comparison-panel"); panel.hidden = false; $("#comparison-verdict").textContent = "Running both planners on the same problem…";
  try {
    const response = await fetch("/api/compare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({blocks,initial:cfg.initial,goal:cfg.goal})});
    const data = await response.json(); if(!data.ok) throw new Error("comparison failed");
    const a=data.astar,g=data.goal_stack; $("#compare-astar-actions").textContent=a.actions; $("#compare-astar-time").textContent=`${a.time_ms.toFixed(3)} ms`; $("#compare-astar-expanded").textContent=a.expanded.toLocaleString();
    $("#compare-gsp-actions").textContent=g.actions??"Failed"; $("#compare-gsp-time").textContent=g.time_ms==null?"—":`${g.time_ms.toFixed(3)} ms`; $("#compare-gsp-iterations").textContent=g.iterations?.toLocaleString()??"—"; $("#compare-gsp-status").textContent=g.status==="solved"?"Teaching baseline":"Could not solve";
    const maximum=Math.max(a.actions,g.actions||a.actions,1); $("#compare-astar-bar").style.width=`${a.actions/maximum*100}%`; $("#compare-gsp-bar").style.width=`${(g.actions||0)/maximum*100}%`;
    const saved=g.actions==null?null:g.actions-a.actions; $("#comparison-verdict").textContent=saved===null?"A* returned an optimal plan; the Goal Stack Planner failed on this state.":saved>0?`A* removes ${saved} unnecessary action${saved===1?"":"s"} for this problem.`:"Both planners produce the same action count for this problem.";
  } catch { $("#comparison-verdict").textContent="Planner comparison is unavailable for this run."; }
}

function buildScene() {
  const scene = $("#scene"); scene.innerHTML = '<div class="three-loading">Loading 3D workcell…</div>'; els = {};
  if (robot3D) { robot3D.dispose(); robot3D = null; }
  import("/static/robot3d.js?v=8").then(({IndustrialRobotScene}) => {
    robot3D = new IndustrialRobotScene(scene);
    if (pendingScene) robot3D.setWorld(pendingScene);
  }).catch(error => { console.error(error); scene.innerHTML = '<div class="three-error">The 3D workcell could not start. Check WebGL support and refresh the page.</div>'; });
}
function laneX(block) {
  const width = Math.max(900, $("#scene").clientWidth || 900); const left = 58; const right = Math.round(width * .51); const usable = width - left - right - BLOCK_W;
  return Math.round(left + (blocks.length === 1 ? usable / 2 : blocks.indexOf(block) * usable / (blocks.length - 1)));
}
function setArmPose(x, bottom) {
  const sceneWidth = Math.max(900, $("#scene").clientWidth || 900); const targetX = x + BLOCK_W / 2; const targetY = SCENE_H - bottom;
  const originX = sceneWidth - 448; const originY = 112; const dx = targetX - originX; const dy = targetY - originY;
  robot.line.style.left = `${originX}px`; robot.line.style.top = `${originY}px`; robot.line.style.width = `${Math.hypot(dx,dy)}px`; robot.line.style.transform = `rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)`;
  robot.effector.style.left = `${targetX-15}px`; robot.effector.style.bottom = `${bottom-2}px`;
}
function actionParts(text) { const match = /^(PICKUP|PUTDOWN|STACK|UNSTACK)\(([^,)]+)(?:,([^\)]+))?\)$/.exec(text || ""); return match ? {name:match[1], x:match[2], y:match[3]} : null; }
function drawScene(snapshot, traceItem, animate = true, previousItem = null) {
  pendingScene = snapshot;
  if (!robot3D) return;
  if (animate && traceItem?.applied && previousItem?.scene) {
    robot3D.animateAction(previousItem.scene, snapshot, traceItem.plan.at(-1), stepDelay(traceItem) * .92);
  } else robot3D.setWorld(snapshot);
}

function formatDuration(ms) { return `${(Math.max(0,ms)/1000).toFixed(2)} s`; }
function updateExecutionOutput(final = false) {
  const current = executionStartedAt ? performance.now() - executionStartedAt : executionElapsedMs;
  $("#clock").textContent = `${(current/1000).toFixed(1).padStart(4,"0")} s`;
  const value = $("#execution-time-value");
  if (value && (final || current > 0)) { value.textContent = formatDuration(current); value.classList.remove("pending"); }
  const total = $("#total-time-value");
  if (total && (final || current > 0)) { total.textContent = `${(current/1000 + Number(result?.time_ms||0)/1000).toFixed(2)} s`; total.classList.remove("pending"); }
}

function classifyTrace(item) {
  if (item.applied) return {kind:"EXECUTE", title:`Robot executes ${item.plan.at(-1)}`, status:"MOVING"};
  if (item.explanation.includes("not true")) return {kind:"PLAN", title:`Selecting an operator for ${item.popped}`, status:"PLANNING"};
  if (item.explanation.includes("already true") || item.explanation.includes("every part is true")) return {kind:"VERIFY", title:`${item.popped} is satisfied`, status:"CHECKING"};
  if (item.popped.startsWith("GOAL")) return {kind:"DECOMPOSE", title:"Breaking the goal into predicates", status:"THINKING"};
  return {kind:"OBSERVE", title:"Reading the current world state", status:"READY"};
}
function goTo(nextIndex, animate = true) {
  if (!result) return;
  const previousItem = result.trace[idx]; idx = Math.max(0,Math.min(result.trace.length-1,nextIndex)); const item = result.trace[idx]; drawScene(item.scene,item,animate,previousItem);
  const stack = $("#p-stack"); stack.innerHTML = ""; [...item.stack].reverse().forEach((text,i) => stack.appendChild(mk("li",i===0?"top":"",text))); if (!item.stack.length) stack.appendChild(mk("li","","(empty)"));
  const state = $("#p-state"); state.innerHTML = ""; item.state.forEach(text => state.appendChild(mk("span",item.added.includes(text)?"add":"",text))); item.deleted.forEach(text => state.appendChild(mk("span","del",text)));
  const plan = $("#p-plan"); plan.innerHTML = ""; item.plan.forEach((text,i) => plan.appendChild(mk("li",item.applied&&i===item.plan.length-1?"cur":"",text))); if (!item.plan.length) plan.appendChild(mk("li","","(no actions yet)"));
  const info = classifyTrace(item); $("#decision-kind").textContent = info.kind; $("#decision-title").textContent = info.title; $("#explain").textContent = item.explanation; $("#run-status span").textContent = info.status; $("#action-label").textContent = item.applied ? item.plan.at(-1) : item.popped;
  const progress = result.trace.length <= 1 ? 100 : Math.round(idx/(result.trace.length-1)*100); $("#timeline").value = String(idx); $("#stepno").textContent = `Step ${idx} of ${result.trace.length-1}`; $("#progress-label").textContent = `${progress}%`; updateExecutionOutput(idx === result.trace.length-1 && executionStartedAt > 0);
  $("#first").disabled = $("#prev").disabled = idx===0; $("#last").disabled = $("#next").disabled = idx===result.trace.length-1;
}

function stepDelay(item) { const base = [2600,2100,1600,1150,800][Number($("#speed").value)-1]; return item?.applied ? base : Math.round(base*.45); }
function scheduleNext() {
  if (!timer) return;
  if (idx >= result.trace.length-1) { executionElapsedMs = executionStartedAt ? performance.now()-executionStartedAt : executionElapsedMs; executionStartedAt = 0; stop(); updateExecutionOutput(true); $("#run-status span").textContent = "Complete"; return; }
  timer = setTimeout(() => { goTo(idx+1,true); scheduleNext(); },stepDelay(result.trace[idx+1]));
}
function play() {
  if (timer) { stop(); return; }
  if (idx >= result.trace.length-1) { goTo(0,false); executionElapsedMs = 0; }
  executionStartedAt = performance.now() - executionElapsedMs;
  $("#play").textContent = "Ⅱ Pause"; $("#run-status span").textContent = "Running"; timer = true; scheduleNext();
}
function stop() { if (timer && timer !== true) clearTimeout(timer); if (executionStartedAt && idx < (result?.trace.length || 1)-1) { executionElapsedMs = performance.now()-executionStartedAt; executionStartedAt = 0; } timer = null; const playButton = $("#play"); if (playButton) playButton.textContent = "▶ Run simulation"; updateExecutionOutput(); }

function download(name,text,type) { const anchor=mk("a"); anchor.href=URL.createObjectURL(new Blob([text],{type})); anchor.download=name; anchor.click(); setTimeout(()=>URL.revokeObjectURL(anchor.href),0); }
function exportTxt() { let text=`Blocks World planning report\nInitial: ${toText(cfg.initial)}\nGoal: ${toText(cfg.goal)}\nAlgorithm: ${result.algorithm}\nActions: ${result.plan_length}\nPlanning time: ${Number(result.time_ms).toFixed(2)} ms\nExecution time: ${executionElapsedMs ? formatDuration(executionElapsedMs) : "not run"}\n\nPLAN\n`; result.plan.forEach((step,i)=>text+=`${i+1}. ${step}\n`); text+="\nEXECUTION TRACE\n"; result.trace.forEach(t=>text+=`[${t.iteration}] ${t.explanation}\n`); return text; }
const getSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)||"[]"); } catch { return []; } };
function renderSaved() { const select=$("#saved"); select.innerHTML='<option value="">None yet</option>'; getSaved().forEach((problem,i)=>{ const option=mk("option","",problem.name); option.value=String(i); select.appendChild(option); }); if (selectedSaved!=="" && getSaved()[Number(selectedSaved)]) select.value=selectedSaved; }

function init() {
  for (let count=2;count<=8;count++){const option=mk("option","",`${count} blocks`);option.value=String(count);$("#n-blocks").appendChild(option);}
  $("#preset").innerHTML='<option value="">Custom configuration</option>'; PRESETS.forEach((preset,i)=>{const option=mk("option","",preset.name);option.value=String(i);$("#preset").appendChild(option);});
  PRESETS.forEach((preset,i)=>{const card=mk("article","ex-card");card.append(mk("span","number",`SCENARIO 0${i+1}`),mk("h3","",preset.name),mk("p","",preset.desc));const button=mk("button","btn","Load scenario →");button.onclick=()=>{loadProblem(preset,String(i));location.hash="planner";};card.appendChild(button);$("#example-cards").appendChild(card);});
  setBlocks(3); defaultCfg(); renderSaved(); restoreWorkspace(); renderSaved(); renderEditors({syncText:false}); $("#initial-text").value=drafts.initial; $("#goal-text").value=drafts.goal; $("#preset").value=selectedPreset;
  $("#n-blocks").onchange=event=>{stop();setBlocks(Number(event.target.value));defaultCfg();selectedPreset="";selectedSaved="";$("#preset").value="";$("#saved").value="";renderEditors();hideResult();showErrors([]);saveWorkspace();};
  $("#preset").onchange=event=>{selectedPreset=event.target.value;if(selectedPreset!=="")loadProblem(PRESETS[Number(selectedPreset)],selectedPreset);else saveWorkspace();};
  $("#saved").onchange=event=>{selectedSaved=event.target.value;if(selectedSaved!==""){const problem=getSaved()[Number(selectedSaved)];setBlocks(problem.blocks);cfg.initial=clone(problem.initial);cfg.goal=clone(problem.goal);drafts={initial:toText(cfg.initial),goal:toText(cfg.goal)};selectedPreset="";$("#preset").value="";renderEditors();hideResult();saveWorkspace();}};
  $("#random").onclick=()=>{cfg.initial=randomState();cfg.goal=randomState();drafts={initial:toText(cfg.initial),goal:toText(cfg.goal)};selectedPreset="";selectedSaved="";$("#preset").value="";$("#saved").value="";renderEditors();hideResult();saveWorkspace();};
  $("#swap").onclick=()=>{[cfg.initial,cfg.goal]=[cfg.goal,cfg.initial];[drafts.initial,drafts.goal]=[drafts.goal,drafts.initial];renderEditors();hideResult();saveWorkspace();};
  $("#reset").onclick=()=>{defaultCfg();selectedPreset="";selectedSaved="";$("#preset").value="";$("#saved").value="";renderEditors();hideResult();showErrors([]);saveWorkspace();};
  $("#save").onclick=()=>{const name=prompt("Name this setup:",`${blocks.length}-block setup`);if(!name)return;const saved=getSaved();saved.push({name,blocks:blocks.length,initial:clone(cfg.initial),goal:clone(cfg.goal)});localStorage.setItem(SAVED_KEY,JSON.stringify(saved));selectedSaved=String(saved.length-1);selectedPreset="";renderSaved();$("#preset").value="";saveWorkspace();};
  ["initial","goal"].forEach(kind=>$("#"+kind+"-text").oninput=event=>handleTextInput(kind,event));
  $("#solve").onclick=solve; $("#first").onclick=()=>{stop();goTo(0,false);}; $("#last").onclick=()=>{stop();goTo(result.trace.length-1,false);}; $("#prev").onclick=()=>{stop();goTo(idx-1,true);}; $("#next").onclick=()=>{stop();goTo(idx+1,true);}; $("#play").onclick=play; $("#timeline").oninput=event=>{stop();goTo(Number(event.target.value),false);};
  $("#cancel-solve").onclick=()=>solveController?.abort(); $("#max-expansions").onchange=saveWorkspace;
  document.querySelectorAll("[data-camera]").forEach(button=>button.onclick=()=>robot3D?.setCameraPreset(button.dataset.camera));
  $("#emergency-stop").onclick=()=>{stop();robot3D?.emergencyStop();$("#run-status span").textContent="Stopped";$("#decision-kind").textContent="E-STOP";$("#decision-title").textContent="Execution stopped by operator";};
  $("#speed").oninput=()=>{$("#speed-label").textContent=SPEEDS[Number($("#speed").value)-1];saveWorkspace();if(timer){stop();play();}}; $("#speed-label").textContent=SPEEDS[Number($("#speed").value)-1];
  $("#ex-json").onclick=()=>download("blocks-world-run.json",JSON.stringify({initial:cfg.initial,goal:cfg.goal,execution_time_ms:executionElapsedMs||null,...result},null,2),"application/json"); $("#ex-txt").onclick=()=>download("blocks-world-report.txt",exportTxt(),"text/plain"); $("#ex-print").onclick=()=>window.print();
  const theme=localStorage.getItem("bw-theme")||"light";document.documentElement.dataset.theme=theme;$("#theme").textContent=theme==="dark"?"Light mode":"Dark mode";$("#theme").onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;$("#theme").textContent=next==="dark"?"Light mode":"Dark mode";localStorage.setItem("bw-theme",next);};
  hideResult();
}
init();
