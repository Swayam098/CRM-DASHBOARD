"use strict";
const token = localStorage.getItem("crm_token");
if (!token) location.replace("login.html");

const SEG_COLOR = {
  "Champions": "#2a78d6", "Loyal": "#1baf7a", "Promising": "#eda100", "At risk": "#eb6834",
};
const tip = document.getElementById("tip");
const SVGNS = "http://www.w3.org/2000/svg";

const money = (n) =>
  n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" :
  n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "k" : "$" + Math.round(n);

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  if (res.status === 401) { localStorage.removeItem("crm_token"); location.replace("login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

document.getElementById("logout").onclick = () => { localStorage.removeItem("crm_token"); location.replace("login.html"); };

// ---- small SVG helpers ----
function el(name, attrs = {}) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function hover(node, html) {
  node.addEventListener("mouseenter", () => { tip.innerHTML = html; tip.style.opacity = 1; });
  node.addEventListener("mousemove", (e) => { tip.style.left = e.clientX + 12 + "px"; tip.style.top = e.clientY + 12 + "px"; });
  node.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
}
function lerpColor(t) { // light->dark blue sequential ramp
  const a = [205, 226, 251], b = [24, 79, 149];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function setBox(svg, w, h) { svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("preserveAspectRatio", "none"); }

// ---- charts ----
function sparkline(svg, values) {
  const W = 220, H = 60, pad = 4;
  setBox(svg, W, H);
  const max = Math.max(...values), min = Math.min(...values);
  const x = (i) => pad + i * (W - 2 * pad) / (values.length - 1);
  const y = (v) => H - pad - (v - min) / (max - min || 1) * (H - 2 * pad);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  svg.append(el("polygon", { points: `${pad},${H - pad} ${line} ${W - pad},${H - pad}`, fill: "rgba(42,120,214,.12)" }));
  svg.append(el("polyline", { points: line, fill: "none", stroke: "#2a78d6", "stroke-width": 2 }));
}

function ribbon(container, segments) {
  const total = segments.reduce((s, d) => s + d.customers, 0);
  container.innerHTML = "";
  for (const d of segments) {
    const pct = d.customers / total;
    const div = document.createElement("div");
    div.className = "seg";
    div.style.flex = pct;
    div.style.background = SEG_COLOR[d.segment] || "#888";
    div.innerHTML = pct > 0.06
      ? `<span>${d.segment}</span><small>${d.customers.toLocaleString()} · ${money(d.total_value)}</small>`
      : "";
    hover(div, `<b>${d.segment}</b><br>${d.customers.toLocaleString()} customers (${(pct * 100).toFixed(1)}%)<br>${money(d.total_value)} predicted value`);
    container.append(div);
  }
}

function segRows(container, segments) {
  container.innerHTML = "";
  for (const d of segments) {
    const row = document.createElement("div");
    row.className = "seg-row";
    row.innerHTML = `
      <div class="spine" style="background:${SEG_COLOR[d.segment]}"></div>
      <div>
        <div class="name">${d.segment}</div>
        <div class="meta">${d.customers.toLocaleString()} customers · ${d.frequency.toFixed(1)} orders ·
          last seen ${Math.round(d.recency)}d ago · ${money(d.monetary)} spent</div>
      </div>
      <div class="val">${money(d.predicted_value)}<small>avg predicted</small></div>`;
    container.append(row);
  }
}

let distEdges = [];

function histogram(svg, dist) {
  distEdges = dist.edges;
  const W = 800, H = 180, padB = 24, padL = 4;
  setBox(svg, W, H);
  const max = Math.max(...dist.counts), n = dist.counts.length;
  const bw = (W - 2 * padL) / n;
  dist.counts.forEach((c, i) => {
    const h = (c / max) * (H - padB - 6);
    const r = el("rect", { x: padL + i * bw + 1, y: H - padB - h, width: Math.max(bw - 2, 1), height: h, fill: lerpColor(i / n), rx: 2 });
    hover(r, `<b>${money(dist.edges[i])} – ${money(dist.edges[i + 1])}</b><br>${c.toLocaleString()} customers`);
    svg.append(r);
  });
  svg.append(el("line", { x1: padL, y1: H - padB, x2: W - padL, y2: H - padB, stroke: "#c3c2b7" }));
  [0, Math.floor(n / 2), n - 1].forEach((i) => {
    const t = el("text", { x: padL + i * bw + bw / 2, y: H - 8, "text-anchor": "middle" });
    t.textContent = money(dist.edges[i]); svg.append(t);
  });
}

function timeSeries(svg, rows, key, mode) {
  const W = 800, H = svg.getAttribute("height") | 0 || 200, padB = 22, padL = 40, padT = 8;
  setBox(svg, W, H);
  const vals = rows.map((r) => r[key]);
  const max = Math.max(...vals);
  const x = (i) => padL + i * (W - padL - 6) / (rows.length - 1 || 1);
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  // gridlines
  [0.5, 1].forEach((g) => svg.append(el("line", { x1: padL, y1: y(max * g), x2: W - 6, y2: y(max * g), stroke: "#e1e0d9" })));
  if (mode === "area") {
    const line = rows.map((r, i) => `${x(i)},${y(r[key])}`).join(" ");
    svg.append(el("polygon", { points: `${padL},${y(0)} ${line} ${x(rows.length - 1)},${y(0)}`, fill: "rgba(42,120,214,.14)" }));
    svg.append(el("polyline", { points: line, fill: "none", stroke: "#2a78d6", "stroke-width": 2 }));
    const dot = el("circle", { r: 4, fill: "#2a78d6", stroke: "#fff", "stroke-width": 2, opacity: 0 });
    svg.append(dot);
    rows.forEach((r, i) => {
      const hit = el("rect", { x: x(i) - (W / rows.length) / 2, y: 0, width: W / rows.length, height: H, fill: "transparent" });
      hit.addEventListener("mouseenter", () => { dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(r[key])); dot.setAttribute("opacity", 1); });
      hit.addEventListener("mouseleave", () => dot.setAttribute("opacity", 0));
      hover(hit, `<b>${r.month}</b><br>${money(r.revenue)} revenue<br>${r.orders.toLocaleString()} orders`);
      svg.append(hit);
    });
  } else {
    const bw = (W - padL - 6) / rows.length;
    rows.forEach((r, i) => {
      const h = (r[key] / max) * (H - padB - padT);
      const rc = el("rect", { x: padL + i * bw + 1, y: H - padB - h, width: Math.max(bw - 2, 1), height: h, fill: "#6da7ec", rx: 2 });
      hover(rc, `<b>${r.month}</b><br>${r.orders.toLocaleString()} orders`);
      svg.append(rc);
    });
  }
  svg.append(el("line", { x1: padL, y1: y(0), x2: W - 6, y2: y(0), stroke: "#c3c2b7" }));
  const yl = el("text", { x: padL - 6, y: y(max) + 4, "text-anchor": "end" }); yl.textContent = mode === "area" ? money(max) : max.toLocaleString(); svg.append(yl);
  [0, rows.length - 1].forEach((i) => { const t = el("text", { x: x(i), y: H - 6, "text-anchor": i ? "end" : "start" }); t.textContent = rows[i].month; svg.append(t); });
}

function scatter(svg, points) {
  const W = 800, H = 300, padB = 30, padL = 46, padT = 8;
  setBox(svg, W, H);
  const fx = points.map((p) => p.frequency), my = points.map((p) => p.monetary), pv = points.map((p) => p.predicted_value);
  const maxF = Math.max(...fx), maxM = Math.max(...my), maxV = Math.max(...pv);
  const x = (v) => padL + (v / maxF) * (W - padL - 10);
  const y = (v) => H - padB - (v / maxM) * (H - padB - padT);
  [0.5, 1].forEach((g) => svg.append(el("line", { x1: padL, y1: y(maxM * g), x2: W - 10, y2: y(maxM * g), stroke: "#e1e0d9" })));
  points.forEach((p) => {
    const t = p.predicted_value / maxV;
    const c = el("circle", { cx: x(p.frequency), cy: y(p.monetary), r: 3 + t * 6, fill: lerpColor(t), "fill-opacity": 0.75, stroke: "#fff", "stroke-width": 0.5 });
    hover(c, `<b>${p.customer_id}</b> · ${p.segment}<br>${p.frequency} orders · ${money(p.monetary)}<br>predicted ${money(p.predicted_value)}`);
    svg.append(c);
  });
  svg.append(el("line", { x1: padL, y1: y(0), x2: W - 10, y2: y(0), stroke: "#c3c2b7" }));
  svg.append(el("line", { x1: padL, y1: padT, x2: padL, y2: y(0), stroke: "#c3c2b7" }));
  const xl = el("text", { x: (W + padL) / 2, y: H - 4, "text-anchor": "middle" }); xl.textContent = "orders (frequency)"; svg.append(xl);
  const yl = el("text", { x: padL - 6, y: padT + 8, "text-anchor": "end" }); yl.textContent = money(maxM); svg.append(yl);
}

function topTable(tbody, rows) {
  tbody.innerHTML = rows.map((r) => `<tr>
    <td>${r.customer_id}</td>
    <td><span style="color:${SEG_COLOR[r.segment]}">●</span> ${r.segment}</td>
    <td class="num">${Math.round(r.recency)}</td>
    <td class="num">${r.frequency}</td>
    <td class="num">${money(r.monetary)}</td>
    <td class="num"><b>${money(r.predicted_value)}</b></td></tr>`).join("");
}

// ---- boot ----
(async function () {
  const [sum, segs, tx, dist, top, pts] = await Promise.all([
    api("/api/summary"), api("/api/segments"), api("/api/transactions"),
    api("/api/distribution"), api("/api/customers?limit=25"), api("/api/scatter"),
  ]);

  document.getElementById("portfolio").textContent = money(sum.predicted_value);
  const recent = tx.slice(-12).map((r) => r.revenue);
  const growth = recent.length > 1 ? (recent.at(-1) / recent[0] - 1) * 100 : 0;
  document.getElementById("rev-delta").textContent = `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% revenue trend`;
  sparkline(document.getElementById("spark"), recent);

  ribbon(document.getElementById("ribbon"), segs);
  segRows(document.getElementById("seg-rows"), segs);
  histogram(document.getElementById("dist"), dist);
  timeSeries(document.getElementById("revenue"), tx, "revenue", "area");
  timeSeries(document.getElementById("orders"), tx, "orders", "bar");
  scatter(document.getElementById("scatter"), pts);
  topTable(document.querySelector("#top tbody"), top);

  const badge = document.getElementById("model-badge"), line = document.getElementById("model-line");
  if (sum.model.loaded) {
    badge.classList.add("live");
    line.innerHTML = `<b>${sum.model.name}</b> v${sum.model.version}<br>MAE ${sum.model.mae} · R² ${sum.model.r2}`;
  } else { line.textContent = "no model registered"; }
})();

document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = document.getElementById("upload-out");
  const fileInput = document.getElementById("ufile");
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  out.textContent = "Uploading...";
  try {
    // Get the current model version before we upload
    let oldVersion = 0;
    try {
      const beforeSum = await api("/api/summary");
      if (beforeSum && beforeSum.model && beforeSum.model.loaded) oldVersion = parseInt(beforeSum.model.version, 10);
    } catch (err) { }

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    
    const overlay = document.getElementById("skeleton-overlay");
    if (overlay) overlay.classList.add("active");
    out.innerHTML = `Uploaded ${data.filename}. Retraining AI in background, please wait...`;
    fileInput.value = "";
    
    // Poll the server every 3 seconds to see if the new model is ready
    const timer = setInterval(async () => {
      try {
        const nowSum = await api("/api/summary");
        if (nowSum && nowSum.model && nowSum.model.loaded && parseInt(nowSum.model.version, 10) > oldVersion) {
          clearInterval(timer);
          out.innerHTML = `<b>Training complete!</b> Model updated to v${nowSum.model.version}. Refreshing dashboard...`;
          setTimeout(() => location.reload(), 1500);
        }
      } catch (err) { }
    }, 3000);
    
  } catch (err) { out.textContent = "Upload failed."; }
});

document.getElementById("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = document.getElementById("entry-out");
  const body = new URLSearchParams({
    customer_id: document.getElementById("ecid").value,
    amount: document.getElementById("eamt").value,
    order_date: document.getElementById("edate").value,
  });
  
  let oldVersion = 0;
  try {
    const beforeSum = await api("/api/summary");
    if (beforeSum && beforeSum.model && beforeSum.model.loaded) {
      oldVersion = parseInt(beforeSum.model.version, 10);
    }
  } catch (err) { }

  try {
    out.textContent = "Recording and retraining...";
    
    // Show the skeleton loader overlay
    const overlay = document.getElementById("skeleton-overlay");
    if (overlay) {
      overlay.style.display = "flex";
      document.body.style.overflow = "hidden";
    }

    const res = await api("/api/transaction", { method: "POST", body });
    
    // Poll for version increment
    const timer = setInterval(async () => {
      try {
        const nowSum = await api("/api/summary");
        if (nowSum && nowSum.model && nowSum.model.loaded && parseInt(nowSum.model.version, 10) > oldVersion) {
          clearInterval(timer);
          out.innerHTML = `Recorded · ${res.transactions.toLocaleString()} transactions total. Training complete!`;
          location.reload();
        }
      } catch (err) { }
    }, 1000);
  } catch (err) { 
    out.textContent = "Could not record transaction. Check the values."; 
    const overlay = document.getElementById("skeleton-overlay");
    if (overlay) {
      overlay.style.display = "none";
      document.body.style.overflow = "auto";
    }
  }
});

document.getElementById("scorer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = new URLSearchParams({
    recency: document.getElementById("r").value,
    frequency: document.getElementById("f").value,
    monetary: document.getElementById("m").value,
  });
  const out = document.getElementById("score-out");
  try {
    const res = await api("/api/predict", { method: "POST", body });
    out.innerHTML = `Predicted 6-month value <b>${money(res.predicted_value)}</b>`;
    
    // Add marker to histogram
    if (distEdges.length > 0) {
      const svg = document.getElementById("dist");
      const oldMarker = document.getElementById("score-marker");
      if (oldMarker) oldMarker.remove();
      
      const W = 800, H = 180, padB = 24, padL = 4;
      const minVal = distEdges[0];
      const maxVal = distEdges[distEdges.length - 1];
      const clampedVal = Math.min(Math.max(res.predicted_value, minVal), maxVal);
      
      // Calculate X coordinate
      const pct = (clampedVal - minVal) / (maxVal - minVal || 1);
      const x = padL + pct * (W - 2 * padL);
      
      const marker = el("line", {
        id: "score-marker",
        x1: x, y1: 10, x2: x, y2: H - padB,
        stroke: "#eb6834", "stroke-width": 3, "stroke-dasharray": "4,4"
      });
      svg.append(marker);
    }
  } catch { out.textContent = "Model not available. Run training first."; }
});
