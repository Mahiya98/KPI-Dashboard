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
  for (let i = 0; i < L.length; i++) {
    n = n * 26 + (L.charCodeAt(i) - 64);
  }
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
Papa.parse(CSV_URL, {
  download: true,
  complete: (res) => {
    try {
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
        obj.__year = getRowYear(obj);
        return obj;
      });

      console.log("✅ Loaded rows:", rawData.length, "Sample:", rawData[0]);

      initFilters();
      updateDashboard();
    } catch (e) {
      console.error(e);
      alert("Error parsing data: " + e.message);
    }
  },
  error: (err) => alert("Error loading data: " + err.message)
});

// ---------- SBU Filter ONLY ----------
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

// ---------- Dashboard update ----------
function updateDashboard() {
  const data = getFiltered();

  setText("kpiOEE",    fmtPct(avg(data, "OEE")));
  setText("kpiOutput", sum(data, "Actual Output").toLocaleString(undefined, {maximumFractionDigits: 0}));
  setText("kpiCount",  data.length);

  setText("kpiNPT",   fmtPct(avgByCol(data, "E")));
  setText("kpiMTTR",  fmtNum(avgByCol(data, "N")));
  setText("kpiMTBF",  fmtNum(avgByCol(data, "O")));
  setText("kpiCapUT", fmtPct(avgByCol(data, "T")));

  renderCharts(data);
  renderTable(data);
}

function getYears(data) {
  return [...new Set(data.map(r => r.__year).filter(y => y && /^\d{4}$/.test(y)))]
           .sort((a, b) => toNum(a) - toNum(b));
}
function withValidYear(data) {
  return data.filter(r => r.__year && /^\d{4}$/.test(r.__year));
}

// 🆕 Year color palette (consistent across all charts)
const YEAR_COLORS = {
  "2024": { main: "#667eea", light: "#a3b1f0" },
  "2025": { main: "#48bb78", light: "#8fd5a8" },
  "2026": { main: "#ed8936", light: "#f4b079" },
  "2027": { main: "#4299e1", light: "#87bff0" },
  "2028": { main: "#e53e3e", light: "#f08585" }
};
const FALLBACK_COLOR = { main: "#9f7aea", light: "#c7afef" };

function colorForYear(yr) {
  return YEAR_COLORS[yr] || FALLBACK_COLOR;
}

// ---------- Charts ----------
function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};

  const cleanData = withValidYear(data);
  const years = getYears(cleanData);
  const sbuSel = $("sbuFilter")?.value || "";

  // ---- 1. OEE Trend by Year ----
  const oeeEl = $("oeeTrend");
  if (oeeEl) {
    const oeeByYear = years.map(y => normPct(avg(cleanData.filter(r => r.__year === y), "OEE")));
    charts.oee = new Chart(oeeEl, {
      type: "line",
      data: { labels: years, datasets: [{
        label: "Avg OEE %",
        data: oeeByYear,
        borderColor: "#667eea",
        backgroundColor: "rgba(102,126,234,0.2)",
        fill: true, tension: 0.3,
        pointRadius: 7, pointHoverRadius: 9,
        borderWidth: 3
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "OEE % – Year-over-Year Trend" } },
        scales: {
          y: { beginAtZero: true, max: 100, title: { display: true, text: "OEE %" } },
          x: { title: { display: true, text: "Year" } }
        }
      }
    });
  }

  // ---- 2. 🆕 Target vs Actual Output – Section-wise + Year-wise ----
  renderTargetVsActualBySection(cleanData, years, sbuSel);

  // ---- 3. 🆕 MTBF vs MTTR – Section-wise + Year-wise ----
  renderMtbfMttrBySection(cleanData, years, sbuSel);

  // ---- 4. Year-over-Year OEE Comparison – ALL Sections ----
  renderYearComparison(cleanData);
}

// ---------- 🆕 Target vs Actual by Section + Year ----------
function renderTargetVsActualBySection(data, years, sbuSel) {
  const el = $("targetVsActual");
  if (!el) return;

  const sections = [...new Set(data.map(r => r["Section"]).filter(Boolean))].sort();

  // Build datasets: for each year, two datasets (Target & Actual)
  const datasets = [];
  years.forEach(yr => {
    const c = colorForYear(yr);
    const targetData = sections.map(sec => sum(
      data.filter(r => r.__year === yr && r["Section"] === sec), "Target"
    ));
    const actualData = sections.map(sec => sum(
      data.filter(r => r.__year === yr && r["Section"] === sec), "Actual Output"
    ));

    datasets.push({
      label: `${yr} Target`,
      data: targetData,
      backgroundColor: c.light,
      borderColor: c.light,
      borderWidth: 1,
      stack: `stack-${yr}`  // group target+actual side-by-side per year
    });
    datasets.push({
      label: `${yr} Actual`,
      data: actualData,
      backgroundColor: c.main,
      borderColor: c.main,
      borderWidth: 1,
      stack: `stack-${yr}`
    });
  });

  const titleText = sbuSel
    ? `Target vs Actual Output – Sections in ${sbuSel} (by Year)`
    : "Target vs Actual Output – Section-wise & Year-wise";

  charts.ta = new Chart(el, {
    type: "bar",
    data: { labels: sections, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: titleText, font: { size: 14, weight: "bold" } },
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Output" } },
        x: { title: { display: true, text: "Section" } }
      }
    }
  });
}

// ---------- 🆕 MTBF vs MTTR by Section + Year ----------
function renderMtbfMttrBySection(data, years, sbuSel) {
  const el = $("mtbfMttr");
  if (!el) return;

  const sections = [...new Set(data.map(r => r["Section"]).filter(Boolean))].sort();

  // For each year: 2 datasets (MTBF & MTTR) — paired with same color hue
  const datasets = [];
  years.forEach(yr => {
    const c = colorForYear(yr);
    const mtbfData = sections.map(sec => avgByCol(
      data.filter(r => r.__year === yr && r["Section"] === sec), "O"
    ));
    const mttrData = sections.map(sec => avgByCol(
      data.filter(r => r.__year === yr && r["Section"] === sec), "N"
    ));

    datasets.push({
      label: `${yr} MTBF`,
      data: mtbfData,
      backgroundColor: c.main,
      borderColor: c.main,
      borderWidth: 1,
      stack: `stack-${yr}`
    });
    datasets.push({
      label: `${yr} MTTR`,
      data: mttrData,
      backgroundColor: c.light,
      borderColor: c.light,
      borderWidth: 1,
      stack: `stack-${yr}`
    });
  });

  const titleText = sbuSel
    ? `MTBF vs MTTR – Sections in ${sbuSel} (by Year)`
    : "MTBF vs MTTR – Section-wise & Year-wise";

  charts.mm = new Chart(el, {
    type: "bar",
    data: { labels: sections, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: titleText, font: { size: 14, weight: "bold" } },
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Hours" } },
        x: { title: { display: true, text: "Section" } }
      }
    }
  });
}

// ---------- Year Comparison Chart (OEE % by Section) ----------
function renderYearComparison(data) {
  const el = $("yearCompare");
  if (!el) return;

  const sbuSel = $("sbuFilter")?.value || "";
  const years  = getYears(data);
  const sections = [...new Set(data.map(r => r["Section"]).filter(Boolean))].sort();

  const datasets = years.map(yr => {
    const c = colorForYear(yr);
    const dataForYear = sections.map(sec => {
      const rows = data.filter(r => r.__year === yr && r["Section"] === sec);
      return normPct(avg(rows, "OEE"));
    });
    return {
      label: yr,
      data: dataForYear,
      backgroundColor: c.main,
      borderColor: c.main,
      borderWidth: 1,
      borderRadius: 4
    };
  });

  const titleText = sbuSel
    ? `Year-over-Year OEE % – Sections in ${sbuSel}`
    : "Year-over-Year OEE % Comparison – All Sections";

  charts.yearCompare = new Chart(el, {
    type: "bar",
    data: { labels: sections, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: titleText, font: { size: 16, weight: "bold" } },
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          title: { display: true, text: "OEE %" },
          ticks: { stepSize: 10 }
        },
        x: { title: { display: true, text: "Section" } }
      }
    }
  });
}

// ---------- Table ----------
function renderTable(data) {
  const table = $("dataTable");
  if (!table) return;
  if (!data.length) { table.innerHTML = "<tr><td>No data</td></tr>"; return; }
  const keys = Object.keys(data[0]).filter(k => k && k !== "__raw" && k !== "__year");
  const head = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${data.map(r => `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}
