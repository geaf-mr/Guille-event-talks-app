# BigQuery Release Notes Viewer & Tweet Sharer

A web application built with **Python Flask** and **plain vanilla HTML, CSS, and JavaScript** that fetches, formats, and displays the official BigQuery Release Notes from Google Cloud documentation, with live refresh and one-click Twitter / X sharing.

---

## 🌟 Features

- **Live Official BigQuery Feed**: Fetches real-time release notes from Google Cloud Atom Feed: `https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`.
- **Discrete Update Decomposition**: Breaks down daily entry groupings into individual, distinct update cards categorized by type (`Feature`, `Change`, `Fixed`, `Announcement`, `Security`, etc.).
- **Refresh Button with Animated Spinner**: Click **"Refresh Notes"** to immediately bypass cache and re-fetch the latest BigQuery release notes from Google Cloud with live spinner feedback.
- **Select & Tweet About Any Update**:
  - Click on any update card to highlight and select it.
  - Floating bottom action bar and individual card buttons let you **Tweet This Update**.
  - Interactive **Tweet Composer Modal** featuring:
    - Pre-drafted tweet summarizing the update with date, category, and key details.
    - Official Google Cloud documentation link and relevant hashtags (`#BigQuery #GoogleCloud #DataEngineering`).
    - Live character counter with Twitter's 280-character limit warnings.
    - One-click **"Post on X"** launching Twitter Web Intent.
    - **"Copy Text"** button with clipboard feedback.
- **Search & Category Filters**:
  - Instant client-side search across update descriptions, dates, and categories.
  - Category pill filter badges with real-time counts.
- **Zero Heavy Frontend Frameworks**: Pure vanilla HTML5, CSS3, and modern JavaScript (ES6+).

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.8+
- Dependencies listed in `requirements.txt`:
  ```bash
  pip install -r requirements.txt
  ```

### 2. Run the Application
```bash
python app.py
```

### 3. Open in Browser
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 📁 Project Structure

```
agy-cli-projects/
├── app.py                 # Flask server, Atom feed parsing, and REST API
├── requirements.txt       # Project dependencies (Flask, requests, beautifulsoup4)
├── README.md              # Project documentation
├── static/
│   ├── css/
│   │   └── style.css      # Vanilla CSS styling with Google Cloud theme
│   └── js/
│       └── app.js         # Vanilla JavaScript (feed rendering, spinner, search, Tweet composer)
└── templates/
    └── index.html         # Vanilla HTML5 template
```
