// ⚠️ Replace with YOUR published CSV URL
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQOtlTSnR-ePaSMoaB60KUjLcKSTyptk68WXWIbz4VF52B_On-9d6R-z6sZOfVPm5qxlKC--M1r59PQ/pub?gid=0&single=true&output=csv";

let rawData = [];
let charts = {};

// Helper: parse percent/number strings
const toNum = (v) => {
  if (v == null || v === "") return NaN;
  const s = String(v).replace(/[%, ]/g, "");
  return parseFloat(s);
};

// Safe DOM helper – never throws if element missing
const $ = (id) => document.getElementById(id);

// Load CSV
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
        const obj = {};
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

function initFilters() {
  const sbuSel     = $("sbuFilter");
  const sectionSel = $("sectionFilter");
  const monthSel   = $("monthFilter");
  const yearSel    = $("yearFilter");

  // SBU
  if (sbuSel) {
    const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
    sbuSel.innerHTML = `<option value="">All SBUs</option>` +
      sbus.map(s => `<option value="${s}">${s}</option>`).join("");
    sbuSel.addEventListener("change", () => { populateSections(); updateDashboard(); });
  }

  // Section
  if (sectionSel) {
    sectionSel.addEventListener("change", updateDashboard);
  }

  // Month
  if (monthSel) {
    const months = [...new Set(rawData.map(r => r["Month"]).filter(Boolean))];
    monthSel.innerHTML = `<option value="">All Months</option>` +
      months.map(m => `<option value="${m}">${m}</option>`).join("");
    monthSel.addEventListener("change", updateDashboard);
  }

  // Year (only if HTML has it)
  if (yearSel) {
    const years = [...new Set(rawData.map(r => r["Year"]).filter(Boolean))]
                    .sort((a, b) => toNum(a) - toNum(b));
    yearSel.innerHTML = `<option value="">All Years</option>` +
      years.map(y => `<option value="${y}">${y}</option>`).join("");
    yearSel.addEventListener("change", updateDashboard);
  }

  // Reset
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

function updateDashboard() {
  const data = getFiltered();

  const oee = avg(data, "OEE");
  const av  = avg(data, "AV");
  const pf  = avg(data, "Perf");
  const ql  = avg(data, "Quality");

  setText("kpiOEE",     (oee * (oee < 1 ? 100 : 1)).toFixed(1) + "%");
  setText("kpiAV",      (av  * (av  < 1 ? 100 : 1)).toFixed(1) + "%");
  setText("kpiPerf",    (pf  * (pf  < 1 ? 100 : 1)).toFixed(1) + "%");
  setText("kpiQuality", (ql  * (ql  < 1 ? 100 : 1)).toFixed(1) + "%");
  setText("kpiOutput",  sum(data, "Actual Output").toLocaleString(undefined, {maximumFractionDigits: 0}));
  setText("kpiCount",   data.length);

  renderCharts(data);
  renderTable(data);
}

function renderCharts(data) {
  const labels = data.map(r => r["Month"]);
  Object.values(charts).forEach(c => c && c.destroy());

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

  const apqEl = $("avPerfQual");
  if (apqEl) charts.apq = new Chart(apqEl, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Availability", data: data.map(r => toNum(r["AV"])      < 1 ? toNum(r["AV"])*100      : toNum(r["AV"])),      backgroundColor: "#48bb78" },
      { label: "Performance",  data: data.map(r => toNum(r["Perf"])    < 1 ? toNum(r["Perf"])*100    : toNum(r["Perf"])),    backgroundColor: "#ed8936" },
      { label: "Quality",      data: data.map(r => toNum(r["Quality"]) < 1 ? toNum(r["Quality"])*100 : toNum(r["Quality"])), backgroundColor: "#4299e1" }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "AV / Performance / Quality %" } } }
  });

  const taEl = $("targetVsActual");
  if (taEl) charts.ta = new Chart(taEl, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Target",        data: data.map(r => toNum(r["Target"])),        backgroundColor: "#a0aec0" },
      { label: "Actual Output", data: data.map(r => toNum(r["Actual Output"])), backgroundColor: "#38b2ac" }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "Target vs Actual Output" } } }
  });

  const mmEl = $("mtbfMttr");
  if (mmEl) charts.mm = new Chart(mmEl, {
    type: "line",
    data: { labels, datasets: [
      { label: "MTBF", data: data.map(r => toNum(r["MTBF"])), borderColor: "#38a169", backgroundColor: "rgba(56,161,105,0.1)", fill: true, tension: 0.3 },
      { label: "MTTR", data: data.map(r => toNum(r["MTTR"])), borderColor: "#e53e3e", backgroundColor: "rgba(229,62,62,0.1)", fill: true, tension: 0.3 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "MTBF vs MTTR" } } }
  });
}

function renderTable(data) {
  const table = $("dataTable");
  if (!table) return;
  if (!data.length) { table.innerHTML = "<tr><td>No data</td></tr>"; return; }
  const keys = Object.keys(data[0]).filter(k => k);
  const head = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${data.map(r => `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}
