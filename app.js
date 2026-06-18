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

// ---------- Filters ----------
function initFilters() {
  const sbuSel     = $("sbuFilter");
  const sectionSel = $("sectionFilter");
  const monthSel   = $("monthFilter");
  const yearSel    = $("yearFilter");

  if (sbuSel) {
    const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
    sbuSel.innerHTML = `<option value="">All SBUs</option>` +
      sbus.map(s => `<option value="${s}">${s}</option>`).join("");
    sbuSel.addEventListener("change", () => { populateSections(); updateDashboard(); });
  }

  if (sectionSel) sectionSel.addEventListener("change", updateDashboard);

  if (monthSel) {
    const months = [...new Set(rawData.map(r => r["Month"]).filter(Boolean))];
    monthSel.innerHTML = `<option value="">All Months</option>` +
      months.map(m => `<option value="${m}">${m}</option>`).join("");
    monthSel.addEventListener("change", updateDashboard);
  }

  if (yearSel) {
    const years = [...new Set(rawData.map(r => r["Year"]).filter(Boolean))]
                    .sort((a, b) => toNum(a) - toNum(b));
    yearSel.innerHTML = `<option value="">All Years</option>` +
      years.map(y => `<option value="${y}">${y}</option>`).join("");
    yearSel.addEventListener("change", updateDashboard);
  }

  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (sbuSel)     sbuSel.value = "";
      if (sectionSel) sectionSel.value = "";
      if (monthSel)   monthSel.value = "";
      if (yearSel)    yearSel.value = "";
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
  const month   = $("monthFilter")?.value   || "";
  const year    = $("yearFilter")?.value    || "";

  return rawData.filter(r =>
    (!sbu     || r["SBU"]     === sbu) &&
    (!section || r["Section"] === section) &&
    (!month   || String(r["Month"]).trim() === String(month).trim()) &&
    (!year    || String(r["Year"]).trim()  === String(year).trim())
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

// ---------- Dashboard update ----------
function updateDashboard() {
  const data = getFiltered();

  // KPIs (kept: OEE, Output, Records, NPT, MTTR, MTBF, CapUT)
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

// ---------- Charts ----------
function renderCharts(data) {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};

  const labels = data.map(r => r["Month"]);

  // ---- OEE Trend (kept) ----
  const oeeEl = $("oeeTrend");
  if (oeeEl) charts.oee = new Chart(oeeEl, {
    type: "line",
    data: { labels, datasets: [{
      label: "OEE %",
      data: data.map(r => toNum(r["OEE"]) < 1 ? toNum(r["OEE"])*100 : toNum(r["OEE"])),
      borderColor: "#667eea", backgroundColor: "rgba(102,126,234,0.2)", fill: true, tension: 0.3
    }]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "OEE Trend" } } }
  });

  // ---- Target vs Actual (kept) ----
  const taEl = $("targetVsActual");
  if (taEl) charts.ta = new Chart(taEl, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Target",        data: data.map(r => toNum(r["Target"])),        backgroundColor: "#a0aec0" },
      { label: "Actual Output", data: data.map(r => toNum(r["Actual Output"])), backgroundColor: "#38b2ac" }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "Target vs Actual Output" } } }
  });

  // ---- MTBF vs MTTR (kept) ----
  const mmEl = $("mtbfMttr");
  if (mmEl) charts.mm = new Chart(mmEl, {
    type: "line",
    data: { labels, datasets: [
      { label: "MTBF", data: data.map(r => toNum(colVal(r, "O"))), borderColor: "#38a169", backgroundColor: "rgba(56,161,105,0.1)", fill: true, tension: 0.3 },
      { label: "MTTR", data: data.map(r => toNum(colVal(r, "N"))), borderColor: "#e53e3e", backgroundColor: "rgba(229,62,62,0.1)", fill: true, tension: 0.3 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "MTBF vs MTTR" } } }
  });

  // ---- 🆕 Year-over-Year Comparison by SBU / Section ----
  renderYearComparison(data);
}

// ---------- 🆕 Year Comparison Chart ----------
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

  // Collect unique years (sorted) and groups
  const years = [...new Set(data.map(r => String(r["Year"]).trim()).filter(Boolean))]
                  .sort((a,b) => toNum(a) - toNum(b));
  const groups = [...new Set(data.map(r => r[groupKey]).filter(Boolean))].sort();

  // For each group + year, average the OEE
  // (You can change "OEE" to any other KPI, e.g. "Actual Output" with sum())
  const colorPalette = [
    "#667eea", "#48bb78", "#ed8936", "#4299e1", "#e53e3e",
    "#38b2ac", "#9f7aea", "#f56565", "#ecc94b", "#38a169"
  ];

  const datasets = years.map((yr, idx) => {
    const dataForYear = groups.map(g => {
      const rows = data.filter(r =>
        String(r["Year"]).trim() === yr && r[groupKey] === g
      );
      const v = avg(rows, "OEE");
      // Normalize to %
      return v > 0 && v <= 1 ? v * 100 : v;
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
        y: {
          beginAtZero: true,
          title: { display: true, text: "OEE %" }
        },
        x: {
          title: { display: true, text: groupKey }
        }
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
