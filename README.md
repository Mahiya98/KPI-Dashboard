# 📊 OEE Performance Dashboard

Interactive web dashboard that reads live data from Google Sheets — **no Apps Script required**.

## ✨ Features
- 3 cascading filters: **SBU → Section**, plus independent **Month** filter
- KPI cards (OEE, AV, Perf, Quality, Output)
- 4 interactive charts (trend, bar, comparison)
- Responsive: works on **laptop & mobile**
- Shareable public URL via GitHub Pages

## 🚀 Setup

### 1. Publish your Google Sheet as CSV
- File → Share → **Publish to the web** → Select sheet → CSV → Publish
- Copy the `.csv` URL

### 2. Update `app.js`
Replace `CSV_URL` at the top with your published URL.

### 3. Deploy on GitHub Pages
```bash
git init
git add .
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/oee-dashboard.git
git push -u origin main
