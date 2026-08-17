/* =============================================================================
 * game.js — engine
 *  - FIRST-PERSON driving view (you are the driver): road rushes toward you,
 *    a signpost for the next stop grows from the horizon.
 *  - Gamification: points (+floating popups), trophies, progress, sounds.
 *  - Stage 3 = ISOMETRIC "load the request onto the truck as it fills up".
 *  - Final quiz + trophy/result with fanfare + confetti.
 * Dependency-free vanilla JS. No build step.
 * ========================================================================== */

(() => {
  "use strict";

  const state = {
    score: 0,
    stageIndex: 0,
    earnedTrophies: [],
    quizIndex: 0,
    phase: "stage"
  };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ===================================================================== */
  /* CHROME: header, score, progress, trophies, mute                        */
  /* ===================================================================== */
  function initChrome() {
    $("#t-title").textContent = GAME.meta.title;
    $("#t-sub").textContent = GAME.meta.subtitle;

    const mute = $("#muteBtn");
    mute.addEventListener("click", () => {
      const m = window.SFX ? SFX.toggleMute() : false;
      mute.textContent = m ? "🔈" : "🔊";
    });
    // unlock audio on first interaction anywhere
    ["pointerdown", "keydown"].forEach((ev) =>
      window.addEventListener(ev, () => window.SFX && SFX.unlock(), { once: true }));

    renderTrophyRail();
    $("#score").textContent = "0";
    updateProgress();
  }

  function addScore(delta, atEl) {
    state.score += delta;
    const s = $("#score");
    s.textContent = state.score;
    s.classList.add("bump");
    setTimeout(() => s.classList.remove("bump"), 160);
    if (atEl) floatPoints("+" + delta, atEl);
  }

  function floatPoints(txt, refEl) {
    const r = refEl.getBoundingClientRect();
    const f = el("div", "floater", txt);
    f.style.left = r.left + r.width / 2 + "px";
    f.style.top = r.top + "px";
    f.style.color = "#ffcf4d";
    f.style.fontSize = "20px";
    document.body.appendChild(f);
    f.animate(
      [{ transform: "translate(-50%,0)", opacity: 1 },
       { transform: "translate(-50%,-46px)", opacity: 0 }],
      { duration: 900, easing: "ease-out" }
    ).onfinish = () => f.remove();
  }

  function updateProgress() {
    const total = GAME.stages.length + 1;
    let done = state.stageIndex;
    if (state.phase === "quiz") done = GAME.stages.length;
    if (state.phase === "result") done = total;
    $("#progressFill").style.width = Math.round((done / total) * 100) + "%";
  }

  function renderTrophyRail() {
    const rail = $("#trophyRail");
    rail.innerHTML = "";
    GAME.stages.forEach((s) => {
      const chip = el("div", "trophy-chip", `${s.icon} ${s.name}`);
      if (state.earnedTrophies.includes(s.id)) chip.classList.add("earned");
      rail.appendChild(chip);
    });
    const q = el("div", "trophy-chip", "🏆 Final Quiz");
    if (state.earnedTrophies.includes("quiz")) q.classList.add("earned");
    rail.appendChild(q);
  }

  function awardTrophy(id) {
    if (!state.earnedTrophies.includes(id)) {
      state.earnedTrophies.push(id);
      renderTrophyRail();
      window.SFX && SFX.trophy();
    }
  }

  /* ===================================================================== */
  /* FIRST-PERSON DRIVING CANVAS                                            */
  /* ===================================================================== */
  const road = {
    canvas: null, ctx: null, W: 960, H: 300, w: 960, h: 300,
    phase: 0,        // lane-stripe scroll phase
    speed: 0,        // current visual speed 0..1
    signDepth: 0.62, // where the current signpost sits (0 far .. 1 near)
    driving: false,
    raf: 0
  };

  function initRoad() {
    road.canvas = $("#road");
    road.ctx = road.canvas.getContext("2d");
    resizeRoad();
    window.addEventListener("resize", resizeRoad);
    idleLoop();
  }

  function resizeRoad() {
    const cssW = road.canvas.parentElement.clientWidth;
    const ratio = road.H / road.W;
    const dpr = window.devicePixelRatio || 1;
    road.w = cssW; road.h = cssW * ratio;
    road.canvas.style.height = road.h + "px";
    road.canvas.width = cssW * dpr;
    road.canvas.height = road.h * dpr;
    road.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRoad();
  }

  // perspective helpers: t in [0..1], 0 = far (horizon), 1 = near (bottom)
  function horizonY() { return road.h * 0.42; }
  function yAt(t) { return horizonY() + (road.h - horizonY()) * (t * t); }
  function roadHalfAt(t) {
    const topHalf = road.w * 0.03, botHalf = road.w * 0.62;
    return topHalf + (botHalf - topHalf) * t;
  }

  function drawRoad() {
    const ctx = road.ctx, W = road.w, H = road.h, cx = W / 2, hy = horizonY();

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, "#241a4d");
    sky.addColorStop(1, "#3a2a6b");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy);
    // distant sun glow
    const glow = ctx.createRadialGradient(cx, hy, 4, cx, hy, W * 0.4);
    glow.addColorStop(0, "rgba(255,180,120,.45)");
    glow.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hy);

    // ground
    const gnd = ctx.createLinearGradient(0, hy, 0, H);
    gnd.addColorStop(0, "#161233");
    gnd.addColorStop(1, "#0b0a1c");
    ctx.fillStyle = gnd; ctx.fillRect(0, hy, W, H - hy);

    // road polygon
    ctx.beginPath();
    ctx.moveTo(cx - roadHalfAt(0), yAt(0));
    ctx.lineTo(cx + roadHalfAt(0), yAt(0));
    ctx.lineTo(cx + roadHalfAt(1), yAt(1));
    ctx.lineTo(cx - roadHalfAt(1), yAt(1));
    ctx.closePath();
    const rg = ctx.createLinearGradient(0, hy, 0, H);
    rg.addColorStop(0, "#33334f");
    rg.addColorStop(1, "#26263c");
    ctx.fillStyle = rg; ctx.fill();

    // road edges
    ctx.lineWidth = 3; ctx.strokeStyle = "#a855f7";
    ctx.beginPath(); ctx.moveTo(cx - roadHalfAt(0), yAt(0)); ctx.lineTo(cx - roadHalfAt(1), yAt(1)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + roadHalfAt(0), yAt(0)); ctx.lineTo(cx + roadHalfAt(1), yAt(1)); ctx.stroke();

    // dashed centre stripes with perspective + scroll
    const count = 14;
    for (let i = 0; i < count; i++) {
      let t = ((i / count) + road.phase) % 1;
      if (t <= 0.02) continue;
      const t2 = Math.min(1, t + 0.035);
      const y1 = yAt(t), y2 = yAt(t2);
      const w1 = Math.max(1, roadHalfAt(t) * 0.045);
      const w2 = Math.max(1, roadHalfAt(t2) * 0.045);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.moveTo(cx - w1, y1); ctx.lineTo(cx + w1, y1);
      ctx.lineTo(cx + w2, y2); ctx.lineTo(cx - w2, y2);
      ctx.closePath(); ctx.fill();
    }

    // roadside pylons (both sides), scrolling toward viewer
    for (let i = 0; i < 8; i++) {
      let t = ((i / 8) + road.phase * 1.0) % 1;
      if (t < 0.05) continue;
      drawPylon(ctx, cx - roadHalfAt(t) - roadHalfAt(t) * 0.10, t);
      drawPylon(ctx, cx + roadHalfAt(t) + roadHalfAt(t) * 0.10, t);
    }

    // the STAGE SIGNPOST on the right, at signDepth
    drawSignpost(ctx, cx);

    // driver POV: dashboard / hood + steering wheel
    drawCockpit(ctx, W, H);
  }

  function drawPylon(ctx, x, t) {
    const y = yAt(t);
    const hgt = 46 * t + 3;
    const wdt = Math.max(1.5, 6 * t);
    ctx.fillStyle = "#4b3d7a";
    ctx.fillRect(x - wdt / 2, y - hgt, wdt, hgt);
    ctx.fillStyle = "#ffcf4d";
    ctx.fillRect(x - wdt / 2, y - hgt, wdt, Math.max(1.5, 4 * t)); // reflective top
  }

  function drawSignpost(ctx, cx) {
    const stage = GAME.stages[Math.min(state.stageIndex, GAME.stages.length - 1)];
    const t = road.signDepth;
    const baseX = cx + roadHalfAt(t) + roadHalfAt(t) * 0.18;
    const baseY = yAt(t);
    const scale = 0.35 + t * 1.05;

    // post
    ctx.fillStyle = "#5b4a86";
    ctx.fillRect(baseX - 3 * scale, baseY - 70 * scale, 6 * scale, 70 * scale);

    // board
    const bw = 150 * scale, bh = 60 * scale;
    const bx = baseX - bw / 2, by = baseY - 70 * scale - bh;
    roundRect(ctx, bx, by, bw, bh, 10 * scale);
    const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
    bg.addColorStop(0, "#7c3aed"); bg.addColorStop(1, "#5b21b6");
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 2 * scale; ctx.strokeStyle = "#ffcf4d"; ctx.stroke();

    // stage number + icon + name
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${16 * scale}px Segoe UI, sans-serif`;
    ctx.fillText(stage.icon + "  STOP " + (state.stageIndex + 1), bx + bw / 2, by + bh * 0.34);
    ctx.font = `700 ${12 * scale}px Segoe UI, sans-serif`;
    wrapText(ctx, stage.name, bx + bw / 2, by + bh * 0.66, bw - 12 * scale, 13 * scale);
  }

  function drawCockpit(ctx, W, H) {
    // hood
    ctx.fillStyle = "#0b0a16";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H * 0.86);
    ctx.quadraticCurveTo(W * 0.5, H * 0.70, W, H * 0.86);
    ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();
    // hood highlight
    ctx.strokeStyle = "rgba(168,85,247,.5)"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.86);
    ctx.quadraticCurveTo(W * 0.5, H * 0.70, W, H * 0.86);
    ctx.stroke();
    // steering wheel
    const wx = W * 0.5, wy = H * 1.02, wr = W * 0.16;
    ctx.strokeStyle = "#1a1730"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(wx, wy, wr, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#2b2b4d"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(wx, wy, wr, Math.PI, Math.PI * 2); ctx.stroke();
    // spokes
    ctx.strokeStyle = "#1a1730"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(wx - wr, wy); ctx.lineTo(wx + wr, wy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - wr); ctx.stroke();
    // IFS hub
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 10px Segoe UI"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("IFS", wx, wy);
  }

  function wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(" ");
    let line = "", lines = [];
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    const startY = y - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lh));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // gentle idle bob so the scene feels alive when stopped
  function idleLoop() {
    if (!road.driving) {
      road.phase = (road.phase + 0.0008) % 1;
      drawRoad();
    }
    requestAnimationFrame(idleLoop);
  }

  // animate a drive between stops
  function driveForward(done) {
    if (road.driving) return done && done();
    road.driving = true;
    const stopEngine = window.SFX ? SFX.engineStart() : null;
    const t0 = performance.now();
    const dur = 1600;
    $("#speedBadge").textContent = "DRIVING · ↑";
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      // speed ramps up then down
      road.speed = Math.sin(p * Math.PI);
      road.phase = (road.phase + 0.010 + road.speed * 0.055) % 1;
      // signpost approaches then passes (recede to far, ready for next)
      road.signDepth = 0.62 + road.speed * 0.36;
      const kmh = Math.round(road.speed * 90);
      $("#speedBadge").textContent = `DRIVING · ${kmh} km/h`;
      drawRoad();
      if (p < 1) road.raf = requestAnimationFrame(step);
      else {
        road.driving = false; road.speed = 0; road.signDepth = 0.62;
        $("#speedBadge").textContent = "STOPPED · 0 km/h";
        stopEngine && stopEngine();
        drawRoad();
        done && done();
      }
    };
    road.raf = requestAnimationFrame(step);
  }

  /* ===================================================================== */
  /* STAGE RENDERING                                                        */
  /* ===================================================================== */
  function renderStage() {
    state.phase = "stage";
    updateProgress();
    const stage = GAME.stages[state.stageIndex];
    const panel = $("#panel");
    panel.innerHTML = "";

    panel.appendChild(el("div", "stage-tag", `STOP ${state.stageIndex + 1} / ${GAME.stages.length}`));
    panel.appendChild(el("h2", null, `${stage.icon} ${stage.name}`));
    panel.appendChild(el("div", "teach", stage.teach));
    panel.appendChild(el("div", "prompt", stage.task.prompt));

    const holder = el("div", "task-holder");
    panel.appendChild(holder);

    const fb = el("div", "feedback");
    const actions = el("div", "actions");
    panel.appendChild(fb);
    panel.appendChild(actions);

    const nextBtn = el("button", "btn", "Drive to next stop ▶");
    nextBtn.disabled = true;
    nextBtn.onclick = () => {
      window.SFX && SFX.click();
      advanceStage();
    };

    const onSolved = (ok, refEl) => {
      if (ok) {
        fb.className = "feedback ok";
        fb.textContent = "✔ " + stage.task.feedbackRight + `  (+${stage.points} pts)`;
        window.SFX && SFX.correct();
        addScore(stage.points, refEl || nextBtn);
        awardTrophy(stage.id);
        nextBtn.disabled = false;
      } else {
        fb.className = "feedback no";
        fb.textContent = "✗ " + stage.task.feedbackWrong;
        window.SFX && SFX.wrong();
      }
    };

    buildTask(stage.task, holder, onSolved, fb);
    actions.appendChild(nextBtn);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function advanceStage() {
    driveForward(() => {
      state.stageIndex++;
      if (state.stageIndex >= GAME.stages.length) startQuiz();
      else renderStage();
    });
  }

  /* ===================================================================== */
  /* TASK BUILDERS                                                          */
  /* ===================================================================== */
  function buildTask(task, holder, onSolved, fb) {
    switch (task.type) {
      case "pick":
      case "decision": return buildPick(task, holder, onSolved);
      case "twopick":  return buildTwoPick(task, holder, onSolved);
      case "load":     return buildLoad(task, holder, onSolved, fb);
      case "order":    return buildOrder(task, holder, onSolved);
      default: holder.textContent = "Unknown task type: " + task.type;
    }
  }

  function buildPick(task, holder, onSolved) {
    const wrap = el("div", "options");
    let solved = false;
    task.options.forEach((o) => {
      const b = el("div", "opt", o.label);
      b.onclick = () => {
        if (solved) return;
        window.SFX && SFX.click();
        if (o.correct) {
          b.classList.add("correct"); solved = true; disable(wrap); onSolved(true, b);
        } else {
          b.classList.add("wrong"); onSolved(false);
        }
      };
      wrap.appendChild(b);
    });
    holder.appendChild(wrap);
  }

  function buildTwoPick(task, holder, onSolved) {
    const picked = {};
    let solved = false;
    task.groups.forEach((grp, gi) => {
      holder.appendChild(el("div", "group-label", grp.label.toUpperCase()));
      const wrap = el("div", "options");
      grp.options.forEach((o) => {
        const b = el("div", "opt", o.label);
        b.onclick = () => {
          if (solved) return;
          window.SFX && SFX.click();
          [...wrap.children].forEach((c) => c.classList.remove("correct", "wrong"));
          picked[gi] = o.correct;
          b.classList.add(o.correct ? "correct" : "wrong");
          if (Object.keys(picked).length === task.groups.length) {
            const allRight = Object.values(picked).every(Boolean);
            onSolved(allRight, b);
            if (allRight) solved = true;
          }
        };
        wrap.appendChild(b);
      });
      holder.appendChild(wrap);
    });
  }

  function buildOrder(task, holder, onSolved) {
    const correct = task.steps.slice();
    const list = el("ul", "order-list");
    let dragEl = null, solved = false;

    shuffle(correct.slice()).forEach((txt) => {
      const li = el("li", "order-item", `<span class="handle">☰</span> ${txt}`);
      li.draggable = true; li.dataset.text = txt;
      li.addEventListener("dragstart", () => { dragEl = li; li.classList.add("dragging"); });
      li.addEventListener("dragend", () => { li.classList.remove("dragging"); });
      list.appendChild(li);
    });

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragEl) return;
      const after = getAfter(list, e.clientY);
      if (after == null) list.appendChild(dragEl);
      else list.insertBefore(dragEl, after);
    });

    function getAfter(container, y) {
      const items = [...container.querySelectorAll(".order-item:not(.dragging)")];
      return items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
      }, { offset: -Infinity }).element;
    }

    const checkBtn = el("button", "btn ghost", "Check order");
    checkBtn.onclick = () => {
      if (solved) return;
      window.SFX && SFX.click();
      const now = [...list.children].map((li) => li.dataset.text);
      const ok = now.every((t, i) => t === correct[i]);
      if (ok) { solved = true; checkBtn.disabled = true; onSolved(true, checkBtn); }
      else onSolved(false);
    };

    holder.appendChild(list);
    holder.appendChild(el("div", "prompt", "Drag rows to reorder, then press Check."));
    holder.appendChild(checkBtn);
  }

  /* ===================================================================== */
  /* STAGE 3: ISOMETRIC "LOAD THE REQUEST" — truck fills up                 */
  /* ===================================================================== */
  function buildLoad(task, holder, onSolved, fb) {
    const needed = task.items.filter((i) => i.correct).length;
    let loadedCount = 0, solved = false;
    const loadedBoxes = []; // {t: animation 0..1, target, color}

    const area = el("div", "load-area");
    const pool = el("div", "load-pool");
    const right = el("div", "load-stage-right");

    // pool chips
    task.items.forEach((it) => {
      const chip = el("div", "chip", `<span>${it.icon}</span><span>${it.label}</span>`);
      chip.draggable = true;
      chip.dataset.correct = it.correct;
      chip.addEventListener("dragstart", (e) => {
        chip.classList.add("dragging");
        e.dataTransfer.setData("correct", String(it.correct));
        e.dataTransfer.setData("label", it.label);
      });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      chip.addEventListener("click", () => tryLoad(it.correct, chip)); // tap fallback
      chip._it = it;
      pool.appendChild(chip);
    });

    // truck canvas
    const canvas = el("canvas");
    canvas.id = "truckCanvas";
    canvas.width = 520; canvas.height = 300;
    const ctx = canvas.getContext("2d");

    // fill meter
    const meter = el("div", "fill-meter");
    const track = el("div", "fill-track");
    const bar = el("div", "fill-bar");
    track.appendChild(bar);
    const lbl = el("div", "fill-label", `Cargo: 0 / ${needed} loaded`);
    meter.appendChild(track); meter.appendChild(lbl);

    right.appendChild(canvas);
    right.appendChild(meter);
    area.appendChild(pool);
    area.appendChild(right);
    holder.appendChild(el("div", "prompt", "Drag correct items onto the truck (or tap them on mobile). Decoys bounce off!"));
    holder.appendChild(area);

    // drop handling on canvas
    canvas.addEventListener("dragover", (e) => { e.preventDefault(); canvas.style.filter = "brightness(1.15)"; });
    canvas.addEventListener("dragleave", () => (canvas.style.filter = "none"));
    canvas.addEventListener("drop", (e) => {
      e.preventDefault(); canvas.style.filter = "none";
      const correct = e.dataTransfer.getData("correct") === "true";
      const label = e.dataTransfer.getData("label");
      const chip = [...pool.children].find((c) => c._it && c._it.label === label);
      tryLoad(correct, chip);
    });

    function tryLoad(correct, chip) {
      if (solved) return;
      if (correct) {
        if (chip.classList.contains("loaded")) return;
        chip.classList.add("loaded");
        window.SFX && SFX.load();
        const colors = ["#a855f7", "#7c3aed", "#34d399", "#ffcf4d"];
        loadedBoxes.push({ t: 0, color: colors[loadedCount % colors.length] });
        loadedCount++;
        bar.style.width = Math.round((loadedCount / needed) * 100) + "%";
        lbl.textContent = `Cargo: ${loadedCount} / ${needed} loaded`;
        if (loadedCount >= needed) {
          solved = true;
          onSolved(true, canvas);
        } else if (fb) {
          fb.className = "feedback ok";
          fb.textContent = "✔ " + (task.feedbackPartial || "Loaded!");
        }
      } else {
        if (chip) { chip.classList.add("reject"); setTimeout(() => chip.classList.remove("reject"), 400); }
        onSolved(false);
      }
    }

    // ---- isometric render loop for this task ----
    function iso(x, y, z) {
      // simple isometric projection
      const ox = canvas.width * 0.5, oy = canvas.height * 0.62;
      return { x: ox + (x - y) * 0.9, y: oy + (x + y) * 0.5 - z };
    }
    function box(cx, cy, w, d, h, color) {
      const top = color, left = shade(color, -30), rightC = shade(color, -55);
      const a = iso(cx - w, cy - d, h), b = iso(cx + w, cy - d, h),
            c = iso(cx + w, cy + d, h), e = iso(cx - w, cy + d, h);
      // top
      ctx.fillStyle = top;
      poly([a, b, c, e]);
      // left face
      const a0 = iso(cx - w, cy + d, 0), e0 = iso(cx - w, cy - d, 0);
      ctx.fillStyle = left; poly([e, c, iso(cx + w, cy + d, 0), a0]);
      // right face
      ctx.fillStyle = rightC; poly([a, e, a0, e0]);
    }
    function poly(pts) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath(); ctx.fill();
    }
    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
      r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
      return `rgb(${r},${g},${b})`;
    }

    function drawTruck() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ground shadow
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      const g = iso(0, 0, 0);
      ctx.ellipse(g.x, g.y + 40, 150, 40, 0, 0, Math.PI * 2);
      ctx.fill();

      // wheels (drawn as dark ellipses at base corners)
      ctx.fillStyle = "#0c0c18";
      [[-60, 40], [60, 40], [-60, -40], [60, -40]].forEach(([wx, wy]) => {
        const p = iso(wx, wy, 6);
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 26, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
      });

      // flatbed platform
      box(0, 0, 70, 46, 18, "#3a2f63");

      // cab (front-left in iso space)
      box(58, 0, 16, 40, 60, "#7c3aed");
      // cab window
      const wp = iso(58, -40, 62);
      ctx.fillStyle = "#bff5f0";
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x + 14, wp.y + 8);
      ctx.lineTo(wp.x + 14, wp.y + 26); ctx.lineTo(wp.x, wp.y + 18);
      ctx.closePath(); ctx.fill();

      // loaded cargo stacks — grow with animation
      loadedBoxes.forEach((bx, i) => {
        bx.t = Math.min(1, bx.t + 0.08);
        const col = i % 2, rowp = Math.floor(i / 2);
        const px = -30 + col * 40;
        const py = -20 + rowp * 40;
        const grow = easeOut(bx.t);
        const h = 34 * grow;
        const drop = (1 - grow) * 60; // drops in from above
        // draw at raised z
        boxAt(px, py, 18, 16, h, bx.color, 20 + drop);
      });

      // "REQUEST" label plate on the bed
      const lp = iso(0, 40, 20);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      roundRect(ctx, lp.x - 42, lp.y - 6, 84, 18, 5); ctx.fill();
      ctx.fillStyle = "#3a2f63"; ctx.font = "800 11px Segoe UI"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(task.target, lp.x, lp.y + 3);

      requestAnimationFrame(drawTruck);
    }
    function boxAt(cx, cy, w, d, h, color, zbase) {
      const top = color, left = shade(color, -30), rightC = shade(color, -55);
      const a = iso(cx - w, cy - d, zbase + h), b = iso(cx + w, cy - d, zbase + h),
            c = iso(cx + w, cy + d, zbase + h), e = iso(cx - w, cy + d, zbase + h);
      ctx.fillStyle = top; poly([a, b, c, e]);
      const a0 = iso(cx - w, cy + d, zbase), e0 = iso(cx - w, cy - d, zbase);
      ctx.fillStyle = left; poly([e, c, iso(cx + w, cy + d, zbase), a0]);
      ctx.fillStyle = rightC; poly([a, e, a0, e0]);
    }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    drawTruck();
  }

  /* ===================================================================== */
  /* FINAL QUIZ                                                             */
  /* ===================================================================== */
  function startQuiz() {
    state.phase = "quiz"; state.quizIndex = 0;
    updateProgress();
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const quiz = GAME.quiz;
    const q = quiz.questions[state.quizIndex];
    const panel = $("#panel");
    panel.innerHTML = "";
    panel.appendChild(el("div", "stage-tag", "🏆 FINAL KNOWLEDGE CHECK"));
    panel.appendChild(el("div", "quiz-progress", `Question ${state.quizIndex + 1} of ${quiz.questions.length}`));
    panel.appendChild(el("div", "quiz-q", q.q));

    const wrap = el("div", "options");
    const fb = el("div", "feedback");
    const actions = el("div", "actions");
    const nextBtn = el("button", "btn", state.quizIndex === quiz.questions.length - 1 ? "See results ▶" : "Next ▶");
    nextBtn.disabled = true;
    let answered = false;

    q.options.forEach((opt, i) => {
      const b = el("div", "opt", opt);
      b.onclick = () => {
        if (answered) return;
        answered = true; disable(wrap);
        if (i === q.answer) {
          b.classList.add("correct");
          window.SFX && SFX.correct();
          addScore(quiz.pointsPerQuestion, b);
          fb.className = "feedback ok";
          fb.textContent = `✔ Correct! (+${quiz.pointsPerQuestion} pts)`;
        } else {
          b.classList.add("wrong");
          wrap.children[q.answer].classList.add("correct");
          window.SFX && SFX.wrong();
          fb.className = "feedback no";
          fb.textContent = "✗ The highlighted answer is correct.";
        }
        nextBtn.disabled = false;
      };
      wrap.appendChild(b);
    });

    nextBtn.onclick = () => {
      window.SFX && SFX.click();
      state.quizIndex++;
      if (state.quizIndex >= quiz.questions.length) showResult();
      else renderQuizQuestion();
    };

    panel.appendChild(wrap); panel.appendChild(fb);
    actions.appendChild(nextBtn); panel.appendChild(actions);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ===================================================================== */
  /* RESULT                                                                 */
  /* ===================================================================== */
  function showResult() {
    state.phase = "result";
    awardTrophy("quiz");
    updateProgress();

    const maxStage = GAME.stages.reduce((a, s) => a + s.points, 0);
    const maxQuiz = GAME.quiz.questions.length * GAME.quiz.pointsPerQuestion;
    const max = maxStage + maxQuiz;
    const pct = Math.round((state.score / max) * 100);
    const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : 1;

    const panel = $("#panel");
    panel.innerHTML = "";
    const r = el("div", "result");
    r.appendChild(el("div", "big-trophy", "🏆"));
    r.appendChild(el("h1", null, "Module Complete!"));
    r.appendChild(el("div", "stars", "★".repeat(stars) + "☆".repeat(3 - stars)));
    r.appendChild(el("div", "final-score", `${state.score} / ${max} points · ${pct}%`));
    r.appendChild(el("p", null, badge(pct)));

    const again = el("button", "btn", "↻ Play again");
    again.onclick = () => { window.SFX && SFX.click(); resetGame(); };
    const actions = el("div", "actions"); actions.style.justifyContent = "center";
    actions.appendChild(again); r.appendChild(actions);
    panel.appendChild(r);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    window.SFX && SFX.complete();
    confettiBurst();
  }

  function badge(pct) {
    if (pct >= 90) return "Outstanding — you’ve mastered Request Initiation basics!";
    if (pct >= 60) return "Nice work — solid understanding of Create New Request.";
    return "Good start — replay to boost your score and retention.";
  }

  function resetGame() {
    state.score = 0; state.stageIndex = 0; state.quizIndex = 0;
    state.earnedTrophies = []; state.phase = "stage";
    $("#score").textContent = "0";
    renderTrophyRail();
    renderStage();
  }

  /* ===================================================================== */
  /* HELPERS                                                                */
  /* ===================================================================== */
  function disable(container) {
    [...container.children].forEach((c) => (c.style.pointerEvents = "none"));
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function confettiBurst() {
    const colors = ["#7c3aed", "#a855f7", "#ffcf4d", "#34d399", "#ff5a7a"];
    for (let i = 0; i < 110; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      c.animate(
        [{ transform: "translateY(0) rotate(0)", opacity: 1 },
         { transform: `translateY(108vh) rotate(${720 + Math.random() * 360}deg)`, opacity: .9 }],
        { duration: 2200 + Math.random() * 1600, easing: "cubic-bezier(.2,.6,.4,1)" }
      ).onfinish = () => c.remove();
    }
  }

  /* ===================================================================== */
  /* BOOT                                                                   */
  /* ===================================================================== */
  window.addEventListener("DOMContentLoaded", () => {
    initChrome();
    initRoad();
    renderStage();
  });
})();
