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

const sumByCol = (arr, letter) => {
  return arr.map(r => toNum(colVal(r, letter))).filter(v => !isNaN(v)).reduce((a,b) => a+b, 0);
};

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

// ---------- Filters (SBU & Section only) ----------
function initFilters() {
  const sbuSel     = $("sbuFilter");
  const sectionSel = $("sectionFilter");

  if (sbuSel) {
    const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
    sbuSel.innerHTML = `<option value="">All SBUs</option>` +
      sbus.map(s => `<option value="${s}">${s}</option>`).join("");
    sbuSel.addEventListener("change", () => { populateSections(); updateDashboard(); });
  }

  if (sectionSel) sectionSel.addEventListener("change", updateDashboard);

  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (sbuSel)     sbuSel.value = "";
      if (sectionSel) sectionSel.value = "";
      populateSections();
      updateDashboard();
    });
  }

  populateSections();
}

function populateSections() {
  const sbuSel     = $("sbuFilter");
  const sectionSel = $("sectionFilter");
  if (!sectionSel) return;

  const sbu = sbuSel ? sbuSel.value : "";
  const filtered = sbu ? rawData.filter(r => r["SBU"] === sbu) : rawData;
  const sections = [...new Set(filtered.map(r => r["Section"]).filter(Boolean))].sort();
  sectionSel.innerHTML = `<option value="">All Sections</option>` +
    sections.map(s => `<option value="${s}">${s}</option>`).join("");
}

function getFiltered() {
  const sbu     = $("sbuFilter")?.value     || "";
  const section = $("sectionFilter")?.value || "";

  return rawData.filter(r =>
    (!sbu     || r["SBU"]     === sbu) &&
    (!section || r["Section"] === section)
  );
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

// ---------- Group helper: returns sorted unique years from data ----------
function getYears(data) {
  return [...new Set(data.map(r => String(r["Year"]).trim()).filter(Boolean))]
           .sort((a, b) => toNum(a) - toNum(b));
}

// ---------- Charts (all YEAR-based now) ----------
function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};

  const years = getYears(data);

  // ---- 1. OEE Trend by Year ----
  const oeeEl = $("oeeTrend");
  if (oeeEl) {
    const oeeByYear = years.map(y => {
      const rows = data.filter(r => String(r["Year"]).trim() === y);
      return normPct(avg(rows, "OEE"));
    });
    charts.oee = new Chart(oeeEl, {
      type: "line",
      data: { labels: years, datasets: [{
        label: "Avg OEE %",
        data: oeeByYear,
        borderColor: "#667eea",
        backgroundColor: "rgba(102,126,234,0.2)",
        fill: true, tension: 0.3,
        pointRadius: 6, pointHoverRadius: 8
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "OEE % – Year-over-Year Trend" } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "OEE %" } } }
      }
    });
  }

  // ---- 2. Target vs Actual Output by Year ----
  const taEl = $("targetVsActual");
  if (taEl) {
    const targetByYear = years.map(y => sum(data.filter(r => String(r["Year"]).trim() === y), "Target"));
    const actualByYear = years.map(y => sum(data.filter(r => String(r["Year"]).trim() === y), "Actual Output"));
    charts.ta = new Chart(taEl, {
      type: "bar",
      data: { labels: years, datasets: [
        { label: "Target",        data: targetByYear, backgroundColor: "#a0aec0" },
        { label: "Actual Output", data: actualByYear, backgroundColor: "#38b2ac" }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "Target vs Actual Output – by Year" } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // ---- 3. MTBF vs MTTR by Year ----
  const mmEl = $("mtbfMttr");
  if (mmEl) {
    const mtbfByYear = years.map(y => avgByCol(data.filter(r => String(r["Year"]).trim() === y), "O"));
    const mttrByYear = years.map(y => avgByCol(data.filter(r => String(r["Year"]).trim() === y), "N"));
    charts.mm = new Chart(mmEl, {
      type: "bar",
      data: { labels: years, datasets: [
        { label: "MTBF", data: mtbfByYear, backgroundColor: "#38a169" },
        { label: "MTTR", data: mttrByYear, backgroundColor: "#e53e3e" }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: "MTBF vs MTTR – by Year" } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // ---- 4. Year-over-Year OEE Comparison by SBU / Section ----
  renderYearComparison(data);
}

// ---------- Year Comparison Chart ----------
function renderYearComparison(data) {
  const el = $("yearCompare");
  if (!el) return;

  const sbuSel     = $("sbuFilter")?.value || "";
  const sectionSel = $("sectionFilter")?.value || "";

  // Decide grouping:
  // - If a Section is chosen → group by Section (only one group)
  // - Else if SBU is chosen → group by Section under that SBU
  // - Else → group by SBU
  const groupKey = sectionSel ? "Section" : (sbuSel ? "Section" : "SBU");

  const years  = getYears(data);
  const groups = [...new Set(data.map(r => r[groupKey]).filter(Boolean))].sort();

  const colorPalette = [
    "#667eea", "#48bb78", "#ed8936", "#4299e1", "#e53e3e",
    "#38b2ac", "#9f7aea", "#f56565", "#ecc94b", "#38a169"
  ];

  const datasets = years.map((yr, idx) => {
    const dataForYear = groups.map(g => {
      const rows = data.filter(r =>
        String(r["Year"]).trim() === yr && r[groupKey] === g
      );
      return normPct(avg(rows, "OEE"));
    });
    return {
      label: yr,
      data: dataForYear,
      backgroundColor: colorPalette[idx % colorPalette.length],
      borderColor: colorPalette[idx % colorPalette.length],
      borderWidth: 1
    };
  });

  charts.yearCompare = new Chart(el, {
    type: "bar",
    data: { labels: groups, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Year-over-Year OEE % Comparison by ${groupKey}`
        },
        legend: { position: "top" }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "OEE %" } },
        x: { title: { display: true, text: groupKey } }
      }
    }
  });
}

// ---------- Table ----------
function renderTable(data) {
  const table = $("dataTable");
  if (!table) return;
  if (!data.length) { table.innerHTML = "<tr><td>No data</td></tr>"; return; }
  const keys = Object.keys(data[0]).filter(k => k && k !== "__raw");
  const head = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${data.map(r => `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}
