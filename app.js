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

// Load CSV
Papa.parse(CSV_URL, {
  download: true,
  complete: (res) => {
    // Headers are at row 17 (index 16), data starts at row 18 (index 17)
    const rows = res.data;
    const headerRow = rows[16];
    const dataRows = rows.slice(17).filter(r => r[0] && r[0].trim() !== "");

    rawData = dataRows.map(r => {
      const obj = {};
      headerRow.forEach((h, i) => { obj[h.trim()] = r[i]; });
      return obj;
    });

    initFilters();
    updateDashboard();
  },
  error: (err) => alert("Error loading data: " + err.message)
});

function initFilters() {
  const sbuSel = document.getElementById("sbuFilter");
  const monthSel = document.getElementById("monthFilter");

  const sbus = [...new Set(rawData.map(r => r["SBU"]).filter(Boolean))].sort();
  sbuSel.innerHTML = `<option value="">All SBUs</option>` +
    sbus.map(s => `<option value="${s}">${s}</option>`).join("");

  const months = [...new Set(rawData.map(r => r["Month"]).filter(Boolean))];
  monthSel.innerHTML = `<option value="">All Months</option>` +
    months.map(m => `<option value="${m}">${m}</option>`).join("");

  sbuSel.addEventListener("change", () => { populateSections(); updateDashboard(); });
  document.getElementById("sectionFilter").addEventListener("change", updateDashboard);
  monthSel.addEventListener("change", updateDashboard);
  document.getElementById("resetBtn").addEventListener("click", () => {
    sbuSel.value = ""; monthSel.value = "";
    populateSections(); updateDashboard();
  });

  populateSections();
}

function populateSections() {
  const sbu = document.getElementById("sbuFilter").value;
  const sectionSel = document.getElementById("sectionFilter");
  const filtered = sbu ? rawData.filter(r => r["SBU"] === sbu) : rawData;
  const sections = [...new Set(filtered.map(r => r["Section"]).filter(Boolean))].sort();
  sectionSel.innerHTML = `<option value="">All Sections</option>` +
    sections.map(s => `<option value="${s}">${s}</option>`).join("");
}

function getFiltered() {
  const sbu = document.getElementById("sbuFilter").value;
  const section = document.getElementById("sectionFilter").value;
  const month = document.getElementById("monthFilter").value;
  return rawData.filter(r =>
    (!sbu || r["SBU"] === sbu) &&
    (!section || r["Section"] === section) &&
    (!month || r["Month"] === month)
  );
}

function avg(arr, key) {
  const vals = arr.map(r => toNum(r[key])).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
}
function sum(arr, key) {
  return arr.map(r => toNum(r[key])).filter(v => !isNaN(v)).reduce((a,b) => a+b, 0);
}

function updateDashboard() {
  const data = getFiltered();

  // KPIs
  document.getElementById("kpiOEE").textContent = (avg(data, "OEE") * (avg(data,"OEE") < 1 ? 100 : 1)).toFixed(1) + "%";
  document.getElementById("kpiAV").textContent = (avg(data, "AV") * (avg(data,"AV") < 1 ? 100 : 1)).toFixed(1) + "%";
  document.getElementById("kpiPerf").textContent = (avg(data, "Perf") * (avg(data,"Perf") < 1 ? 100 : 1)).toFixed(1) + "%";
  document.getElementById("kpiQuality").textContent = (avg(data, "Quality") * (avg(data,"Quality") < 1 ? 100 : 1)).toFixed(1) + "%";
  document.getElementById("kpiOutput").textContent = sum(data, "Actual Output").toLocaleString(undefined, {maximumFractionDigits: 0});
  document.getElementById("kpiCount").textContent = data.length;

  renderCharts(data);
  renderTable(data);
}

function renderCharts(data) {
  const labels = data.map(r => r["Month"]);

  // Destroy old charts
  Object.values(charts).forEach(c => c && c.destroy());

  // 1. OEE Trend
  charts.oee = new Chart(document.getElementById("oeeTrend"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "OEE %",
        data: data.map(r => toNum(r["OEE"]) < 1 ? toNum(r["OEE"])*100 : toNum(r["OEE"])),
        borderColor: "#667eea", backgroundColor: "rgba(102,126,234,0.2)",
        fill: true, tension: 0.3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: "OEE Trend" } } }
  });

  // 2. AV / Perf / Quality
  charts.apq = new Chart(document.getElementById("avPerfQual"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Availability", data: data.map(r => toNum(r["AV"]) < 1 ? toNum(r["AV"])*100 : toNum(r["AV"])), backgroundColor: "#48bb78" },
        { label: "Performance", data: data.map(r => toNum(r["Perf"]) < 1 ? toNum(r["Perf"])*100 : toNum(r["Perf"])), backgroundColor: "#ed8936" },
        { label: "Quality", data: data.map(r => toNum(r["Quality"]) < 1 ? toNum(r["Quality"])*100 : toNum(r["Quality"])), backgroundColor: "#4299e1" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: "AV / Performance / Quality %" } } }
  });

  // 3. Target vs Actual
  charts.ta = new Chart(document.getElementById("targetVsActual"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Target", data: data.map(r => toNum(r["Target"])), backgroundColor: "#a0aec0" },
        { label: "Actual Output", data: data.map(r => toNum(r["Actual Output"])), backgroundColor: "#38b2ac" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: "Target vs Actual Output" } } }
  });

  // 4. MTBF vs MTTR
  charts.mm = new Chart(document.getElementById("mtbfMttr"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "MTBF", data: data.map(r => toNum(r["MTBF"])), borderColor: "#38a169", backgroundColor: "rgba(56,161,105,0.1)", fill: true, tension: 0.3 },
        { label: "MTTR", data: data.map(r => toNum(r["MTTR"])), borderColor: "#e53e3e", backgroundColor: "rgba(229,62,62,0.1)", fill: true, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: "MTBF vs MTTR" } } }
  });
}

function renderTable(data) {
  const table = document.getElementById("dataTable");
  if (!data.length) { table.innerHTML = "<tr><td>No data</td></tr>"; return; }
  const keys = Object.keys(data[0]).filter(k => k);
  const head = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${data.map(r => `<tr>${keys.map(k => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}
