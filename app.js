// ⚠️ REPLACE WITH YOUR PUBLISHED CSV URL (File → Share → Publish to web → CSV)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQOtlTSnR-ePaSMoaB60KUjLcKSTyptk68WXWIbz4VF52B_On-9d6R-z6sZOfVPm5qxlKC--M1r59PQ/pub?gid=0&single=true&output=csv";

let rawData = [];
let charts = {};

const toNum = (v) => {
  if (v == null || v === "") return NaN;
  return parseFloat(String(v).replace(/[%, ]/g, ""));
};
const $ = (id) => document.getElementById(id);
const colLetterToIndex = (letter) => {
  let n = 0;
  for (let i = 0; i < letter.length; i++) n = n * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  return n - 1;
};
const colVal = (row, letter) => row?.__raw?.[colLetterToIndex(letter)];
const avgByCol = (arr, letter) => {
  const vals = arr.map(r => toNum(colVal(r, letter))).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
};

function getRowSection(row) {
  const v = colVal(row, "B");
  return v == null ? "" : String(v).trim();
}
function getRowYear(row) {
  const v = colVal(row, "U");
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || /^(none|ne|null|n\/a|-)$/i.test(s)) return "";
  const m = s.match(/(\d{2,4})/);
  if (!m) return "";
  let yr = m[1];
  if (yr.length === 2) yr = "20" + yr;
  const num = parseInt(yr, 10);
  return (num >= 2000 && num <= 2100) ? yr : "";
}

console.log("⏳ Fetching CSV…");
Papa.parse(CSV_URL, {
  download: true,
  complete: (res) => {
    try {
      const rows = res.data;
      const headerRow = rows[16];
      if (!headerRow) { alert("Header row not found at row 17."); return; }
      const dataRows = rows.slice(17).filter(r => r[0] && String(r[0]).trim() !== "");
      rawData = dataRows.map(r => {
        const obj = { __raw: r };
        headerRow.forEach((h, i) => { if (h) obj[String(h).trim()] = r[i]; });
        obj.__year = getRowYear(obj);
        obj.__section = getRowSection(obj);
        return obj;
      });
      console.log("✅ Loaded:", rawData.length, "rows | Sample:", rawData[0]);
      initFilters();
      updateDashboard();
    } catch (e) { console.error(e); alert("Parse error: " + e.message); }
  },
  error: (err) => { console.error(err); alert("Load error: " + err.message); }
});

function initFilters() {
  const sbuSel = $("sbuFilter");
  if (sbuSel) {
    const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
    sbuSel.innerHTML = `<option value="">All SBUs</option>` +
      sbus.map(s => `<option value="${s}">${s}</option>`).join("");
    sbuSel.addEventListener("change", updateDashboard);
  }
  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (sbuSel) sbuSel.value = "";
    updateDashboard();
  });
}

function getFiltered() {
  const sbu = $("sbuFilter")?.value || "";
  return rawData.filter(r => !sbu || r["SBU"] === sbu);
}

const avg = (arr, key) => {
  const vals = arr.map(r => toNum(r[key])).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
};
const sum = (arr, key) => arr.map(r => toNum(r[key])).filter(v => !isNaN(v)).reduce((a,b)=>a+b,0);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const fmtPct = (v) => (v * (v > 0 && v <= 1 ? 100 : 1)).toFixed(1) + "%";
const fmtNum = (v) => (isNaN(v) ? "—" : v.toFixed(1));
const normPct = (v) => (v > 0 && v <= 1 ? v * 100 : v);

function updateDashboard() {
  const data = getFiltered();
  setText("kpiOEE",    fmtPct(avg(data, "OEE")));
  setText("kpiOutput", sum(data, "Actual Output").toLocaleString(undefined, {maximumFractionDigits: 0}));
  setText("kpiCount",  data.length);
  setText("kpiNPT",    fmtPct(avgByCol(data, "E")));
  setText("kpiMTTR",   fmtNum(avgByCol(data, "N")));
  setText("kpiMTBF",   fmtNum(avgByCol(data, "O")));
  setText("kpiCapUT",  fmtPct(avgByCol(data, "T")));
  renderCharts(data);
  renderTable(data);
}

const getYears = (data) =>
  [...new Set(data.map(r => r.__year).filter(y => y && /^\d{4}$/.test(y)))]
    .sort((a, b) => toNum(a) - toNum(b));
const getSections = (data) =>
  [...new Set(data.map(r => r.__section).filter(Boolean))].sort();
const withValid = (data) =>
  data.filter(r => r.__year && /^\d{4}$/.test(r.__year) && r.__section);

const YEAR_COLORS = {
  "2024": { main: "#667eea", light: "#a3b1f0" },
  "2025": { main: "#48bb78", light: "#8fd5a8" },
  "2026": { main: "#ed8936", light: "#f4b079" },
  "2027": { main: "#4299e1", light: "#87bff0" }
};
const colorForYear = (yr) => YEAR_COLORS[yr] || { main: "#9f7aea", light: "#c7afef" };

function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
  const clean = withValid(data);
  const years = getYears(clean);
  const sections = getSections(clean);
  const sbu = $("sbuFilter")?.value || "";

  // 1. OEE % by Section + Year
  const oeeEl = $("oeeTrend");
  if (oeeEl) {
    charts.oee = new Chart(oeeEl, {
      type: "bar",
      data: {
        labels: sections,
        datasets: years.map(yr => {
          const c = colorForYear(yr);
          return {
            label: yr,
            data: sections.map(sec => normPct(avg(clean.filter(r => r.__year === yr && r.__section === sec), "OEE"))),
            backgroundColor: c.main, borderRadius: 4
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: sbu ? `OEE % – ${sbu}` : "OEE % – Section & Year", font: { size: 14, weight: "bold" } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: 100, title: { display: true, text: "OEE %" } },
          x: { title: { display: true, text: "Section" } }
        }
      }
    });
  }

  // 2. Target vs Actual by Section + Year
  const taEl = $("targetVsActual");
  if (taEl) {
    const datasets = [];
    years.forEach(yr => {
      const c = colorForYear(yr);
      datasets.push({
        label: `${yr} Target`,
        data: sections.map(sec => sum(clean.filter(r => r.__year === yr && r.__section === sec), "Target")),
        backgroundColor: c.light
      });
      datasets.push({
        label: `${yr} Actual`,
        data: sections.map(sec => sum(clean.filter(r => r.__year === yr && r.__section === sec), "Actual Output")),
        backgroundColor: c.main
      });
    });
    charts.ta = new Chart(taEl, {
      type: "bar",
      data: { labels: sections, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: sbu ? `Target vs Actual – ${sbu}` : "Target vs Actual – Section & Year", font: { size: 14, weight: "bold" } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toLocaleString()}` } }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Output" } },
          x: { title: { display: true, text: "Section" } }
        }
      }
    });
  }

  // 3. MTBF vs MTTR by Section + Year
  const mmEl = $("mtbfMttr");
  if (mmEl) {
    const datasets = [];
    years.forEach(yr => {
      const c = colorForYear(yr);
      datasets.push({
        label: `${yr} MTBF`,
        data: sections.map(sec => avgByCol(clean.filter(r => r.__year === yr && r.__section === sec), "O")),
        backgroundColor: c.main
      });
      datasets.push({
        label: `${yr} MTTR`,
        data: sections.map(sec => avgByCol(clean.filter(r => r.__year === yr && r.__section === sec), "N")),
        backgroundColor: c.light
      });
    });
    charts.mm = new Chart(mmEl, {
      type: "bar",
      data: { labels: sections, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: sbu ? `MTBF vs MTTR – ${sbu}` : "MTBF vs MTTR – Section & Year", font: { size: 14, weight: "bold" } }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Hours" } },
          x: { title: { display: true, text: "Section" } }
        }
      }
    });
  }

  // 4. Year Comparison (OEE)
  const ycEl = $("yearCompare");
  if (ycEl) {
    charts.yc = new Chart(ycEl, {
      type: "bar",
      data: {
        labels: sections,
        datasets: years.map(yr => {
          const c = colorForYear(yr);
          return {
            label: yr,
            data: sections.map(sec => normPct(avg(clean.filter(r => r.__year === yr && r.__section === sec), "OEE"))),
            backgroundColor: c.main, borderRadius: 4
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: sbu ? `YoY OEE % – ${sbu}` : "Year-over-Year OEE % – All Sections", font: { size: 14, weight: "bold" } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: 100, title: { display: true, text: "OEE %" } },
          x: { title: { display: true, text: "Section" } }
        }
      }
    });
  }
}

function renderTable(data) {
  const table = $("dataTable");
  if (!table) return;
  if (!data.length) { table.innerHTML = "<tr><td>No data</td></tr>"; return; }
  const keys = Object.keys(data[0]).filter(k => k && !k.startsWith("__"));
  const head = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${data.slice(0, 100).map(r => `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}
