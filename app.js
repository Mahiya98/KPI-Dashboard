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

// ---------- 🆕 SBU Filter ONLY ----------
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

// ---------- Helpers ----------
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
  const data = getFiltered(); // 🆕 respects SBU filter

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

// ---------- Charts ----------
function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};

  const cleanData = withValidYear(data);
  const years = getYears(cleanData);

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

  // ---- 2. Target vs Actual Output by Year ----
  const taEl = $("targetVsActual");
  if (taEl) {
    const targetByYear = years.map(y => sum(cleanData.filter(r => r.__year === y), "Target"));
    const actualByYear = years.map(y => sum(cleanData.filter(r => r.__year === y), "Actual Output"));
    charts.ta = new Chart(taEl, {
      type: "bar",
      data: { labels: years, datasets: [
        { label: "Target",        data: targetByYear, backgroundColor: "#a0aec0" },
        { label: "Actual Output", data: actualByYear, backgroundColor: "#38b2ac" }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "Target vs Actual Output – by Year" } },
        scales: {
          y: { beginAtZero: true },
          x: { title: { display: true, text: "Year" } }
        }
      }
    });
  }

  // ---- 3. MTBF vs MTTR by Year ----
  const mmEl = $("mtbfMttr");
  if (mmEl) {
    const mtbfByYear = years.map(y => avgByCol(cleanData.filter(r => r.__year === y), "O"));
    const mttrByYear = years.map(y => avgByCol(cleanData.filter(r => r.__year === y), "N"));
    charts.mm = new Chart(mmEl, {
      type: "bar",
      data: { labels: years, datasets: [
        { label: "MTBF", data: mtbfByYear, backgroundColor: "#38a169" },
        { label: "MTTR", data: mttrByYear, backgroundColor: "#e53e3e" }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "MTBF vs MTTR – by Year" } },
        scales: {
          y: { beginAtZero: true },
          x: { title: { display: true, text: "Year" } }
        }
      }
    });
  }

  renderYearComparison(cleanData);
}

// ---------- Year Comparison Chart (always groups by Section) ----------
function renderYearComparison(data) {
  const el = $("yearCompare");
  if (!el) return;

  const groupKey = "Section"; // always sections
  const sbuSel = $("sbuFilter")?.value || "";

  const years  = getYears(data);
  const groups = [...new Set(data.map(r => r[groupKey]).filter(Boolean))].sort();

  const yearColors = {
    "2024": "#667eea",
    "2025": "#48bb78",
    "2026": "#ed8936",
    "2027": "#4299e1",
    "2028": "#e53e3e"
  };
  const fallback = ["#9f7aea", "#f56565", "#ecc94b", "#38a169", "#38b2ac"];

  const datasets = years.map((yr, idx) => {
    const dataForYear = groups.map(g => {
      const rows = data.filter(r => r.__year === yr && r[groupKey] === g);
      return normPct(avg(rows, "OEE"));
    });
    const color = yearColors[yr] || fallback[idx % fallback.length];
    return {
      label: yr,
      data: dataForYear,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4
    };
  });

  const titleText = sbuSel
    ? `Year-over-Year OEE % – Sections in ${sbuSel}`
    : "Year-over-Year OEE % Comparison – All Sections";

  charts.yearCompare = new Chart(el, {
    type: "bar",
    data: { labels: groups, datasets },
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
          beginAtZero: true,
          max: 100,
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
