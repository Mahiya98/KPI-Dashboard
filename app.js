// ⚠️ Replace with YOUR published CSV URL
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQOtlTSnR-ePaSMoaB60KUjLcKSTyptk68WXWIbz4VF52B_On-9d6R-z6sZOfVPm5qxlKC--M1r59PQ/pub?gid=0&single=true&output=csv";

let rawData = [];
let charts = {};

// ---------- Helpers ----------
const toNum = (v) => {
  if (v == null || v === "") return NaN;
  const s = String(v).replace(/[%, ]/g, "");
  return parseFloat(s);
};

const $ = (id) => document.getElementById(id);

const colLetterToIndex = (letter) => {
  let n = 0;
  const L = String(letter).toUpperCase();
  for (let i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64);
  return n - 1;
};

const colVal = (row, letter) => {
  if (!row || !row.__raw) return undefined;
  return row.__raw[colLetterToIndex(letter)];
};

const avgByCol = (arr, letter) => {
  const vals = arr.map(r => toNum(colVal(r, letter))).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
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
  if (num < 2000 || num > 2100) return "";
  return yr;
}

// ---------- Load CSV ----------
console.log("⏳ Fetching CSV…", CSV_URL);

Papa.parse(CSV_URL, {
  download: true,
  complete: (res) => {
    try {
      console.log("📥 CSV downloaded. Total raw rows:", res.data.length);

      const rows = res.data;
      const headerRow = rows[16];
      if (!headerRow) {
        alert("Header row not found at row 17. Check your sheet layout.");
        return;
      }
      const dataRows = rows.slice(17).filter(r => r[0] && String(r[0]).trim() !== "");

      rawData = dataRows.map(r => {
        const obj = { __raw: r };
        headerRow.forEach((h, i) => {
          if (h) obj[String(h).trim()] = r[i];
        });
        obj.__year    = getRowYear(obj);
        obj.__section = getRowSection(obj);
        return obj;
      });

      console.log("✅ Loaded rows:", rawData.length);
      console.log("📋 Sample row:", rawData[0]);
      console.log("📅 Sample year:", rawData[0]?.__year, "📦 Sample section:", rawData[0]?.__section);

      initFilters();
      updateDashboard();
    } catch (e) {
      console.error("❌ Parse error:", e);
      alert("Error parsing data: " + e.message);
    }
  },
  error: (err) => {
    console.error("❌ Fetch error:", err);
    alert("Error loading data: " + err.message + "\n\nCheck:\n1. Is the Google Sheet published to the web?\n2. Is the URL correct?\n3. Is internet connected?");
  }
});

// ---------- SBU Filter ----------
function initFilters() {
  const sbuSel = $("sbuFilter");
  if (sbuSel) {
    const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
    sbuSel.innerHTML = `<option value="">All SBUs</option>` +
      sbus.map(s => `<option value="${s}">${s}</option>`).join("");
    sbuSel.addEventListener("change", updateDashboard);
  }
  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (sbuSel) sbuSel.value = "";
      updateDashboard();
    });
  }
}

function getFiltered() {
  const sbu = $("sbuFilter")?.value || "";
  return rawData.filter(r => !sbu || r["SBU"] === sbu);
}

function avg(arr, key) {
  const vals = arr.map(r => toNum(r[key])).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
}
function sum(arr, key) {
  return arr.map(r => toNum(r[key])).filter(v => !isNaN(v)).reduce((a,b) => a+b, 0);
}
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

function getYears(data) {
  return [...new Set(data.map(r => r.__year).filter(y => y && /^\d{4}$/.test(y)))]
           .sort((a, b) => toNum(a) - toNum(b));
}
function getSections(data) {
  return [...new Set(data.map(r => r.__section).filter(Boolean))].sort();
}
function withValidYear(data) {
  return data.filter(r => r.__year && /^\d{4}$/.test(r.__year) && r.__section);
}

const YEAR_COLORS = {
  "2024": { main: "#667eea", light: "#a3b1f0" },
  "2025": { main: "#48bb78", light: "#8fd5a8" },
  "2026": { main: "#ed8936", light: "#f4b079" },
  "2027": { main: "#4299e1", light: "#87bff0" }
};
const FALLBACK_COLOR = { main: "#9f7aea", light: "#c7afef" };
const colorForYear = (yr) => YEAR_COLORS[yr] || FALLBACK_COLOR;

function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};

  const cleanData = withValidYear(data);
  const years    = getYears(cleanData);
  const sections = getSections(cleanData);
  const sbuSel   = $("sbuFilter")?.value || "";

  renderOEEbySection(cleanData, years, sections, sbuSel);
  renderTargetVsActualBySection(cleanData, years, sections, sbuSel);
  renderMtbfMttrBySection(cleanData, years, sections, sbuSel);
  renderYearComparison(cleanData, years, sections, sbuSel);
}

function renderOEEbySection(data, years, sections, sbuSel) {
  const el = $("oeeTrend");
  if (!el) return;
  const datasets = years.map(yr => {
    const c = colorForYear(yr);
    return {
      label: yr,
      data: sections.map(sec => normPct(avg(data.filter(r => r.__year === yr && r.__section === sec), "OEE"))),
      backgroundColor: c.main, borderColor: c.main, borderWidth: 1, borderRadius: 4
    };
  });
  charts.oee = new Chart(el, {
    type: "bar",
    data: { labels: sections, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: sbuSel ? `OEE % – Sections in ${sbuSel}` : "OEE % – Section-wise & Year-wise" },
        legend: { position: "top" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, title: { display: true, text: "OEE %" } },
        x: { title: { display: true, text: "Section" } }
      }
    }
  });
}

function renderTargetVsActualBySection(data, years, sections, sbuSel) {
  const el = $("targetVsActual");
  if (!el) return;
  const datasets = [];
  years.forEach(yr => {
    const c = colorForYear(yr);
    datasets.push({
      label: `${yr} Target`,
      data: sections.map(sec => sum(data.filter(r => r.__year === yr && r.__section === sec), "Target")),
      backgroundColor: c.light, borderColor: c.light, borderWidth: 1
    });
    datasets.push({
      label: `${yr} Actual`,
      data: sections.map(sec => sum(data.filter(r => r.__year === yr && r.__section === sec), "Actual Output")),
      backgroundColor: c.main, borderColor: c.main, borderWidth: 1
    });
  });
  charts.ta = new Chart(el, {
    type: "bar",
    data: { labels: sections, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: sbuSel ? `Target vs Actual – ${sbuSel}` : "Target vs Actual – Section & Year" },
        legend: { position: "top" }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Output" } },
        x: { title:
