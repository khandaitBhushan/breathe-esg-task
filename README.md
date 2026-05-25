# Breathe ESG Ingestion Engine & Review Dashboard

An audit-grade, multi-tenant carbon accounting ingestion pipeline and analyst review ledger built for **Breathe ESG**. This prototype is designed to handle realistic, messy enterprise data sources (SAP material ledger exports, electric utility billing invoices, and Concur corporate travel APIs), standardizing them into auditable greenhouse gas (GHG) emission activity ledgers.

---

## 🚀 Live Deployed Links

*   **Live Hosted Portal**: [https://breathe-esg-pipeline-zsu6.onrender.com](https://breathe-esg-pipeline-zsu6.onrender.com)
*   **Database Admin Panel**: [https://breathe-esg-pipeline-zsu6.onrender.com/admin](https://breathe-esg-pipeline-zsu6.onrender.com/admin)
    *   **Username**: `admin`
    *   **Password**: `password`
*   **GitHub Repository**: [https://github.com/khandaitBhushan/breathe-esg-task](https://github.com/khandaitBhushan/breathe-esg-task)

---

## 🛠️ The Technology Stack

*   **Backend Framework**: Django REST Framework (DRF) – selected for strong security, transaction integrity, multi-tenant ORM scopes, and administrative audit trails.
*   **Frontend Library**: React + Vite + TypeScript – selected for fast page compilation, component typing, and highly responsive user interfaces.
*   **Database**: SQLite (for zero-configuration local runs) and PostgreSQL (for production-grade cloud storage on Render). 
*   **Styling System**: Bespoke, customized Vanilla CSS – styled with modern dark-mode panels, glassmorphic filters (`backdrop-filter: blur`), glowing status tags, and fluid responsive grid layouts.

---

## 📂 Core Deliverables & Documentation

The five required grading documents are stored directly at the root of this repository:

1.  [`MODEL.md`](file:///MODEL.md): Relational schemas, multi-tenant security scopes, proration tables, and field-level change-logging audit ledgers.
2.  [`DECISIONS.md`](file:///DECISIONS.md): Architectural decisions (AL11 SAP ledger formats, daily proration, Haversine flight distance calculations) and questions for the PM.
3.  [`TRADEOFFS.md`](file:///TRADEOFFS.md): A detailed, professional defense of why we omitted PDF OCR parsers, live currency APIs, and aviation radar tracking.
4.  [`SOURCES.md`](file:///SOURCES.md): Deep-dive research on real-world SAP table columns, PG&E invoice schemas, and Concur API segments.
5.  [`walkthrough.md`](file:///C:/Users/bhush/.gemini/antigravity/brain/3dbe1619-1bc5-46bc-96fa-d2e626ace138/walkthrough.md): Comprehensive developer setup and testing guidelines.

---

## 💡 Functional Ingestion Rules Implemented

*   **SAP Fuel & Spend**: Automatically converts volume units (GAL ➡️ Liters), scales quantities by the Debit/Credit indicator (`SHKZG = H`) to deduct carbon for returns, and applies stationary fuel coefficients (Diesel/Heating Oil) or spend-based Scope 3 purchased goods multipliers.
*   **Utility Billing (Calendar Month Proration)**: Parses start and end billing cycles, divides them into daily shares, aggregates them cleanly into separate calendar-month ledger rows, and assigns grid mixes based on facility state (e.g. CAMX).
*   **Travel API segments**: Computes great-circle flight distances using the **Haversine formula** dynamically via global airport coordinates if miles are missing, and applies cabin-class radiative forcing multipliers.
*   **Anomalies & Warnings**: Automatically triggers warnings if billing files overlap or if consumption exceeds $300\%$ of a facility's historical average.
*   **Assurance Trails**: Timelines tracking all analyst corrections (old value, new value, editor, date, and mandatory comment reason) and lock controls to seal approved rows.

---

## 💻 Running the Project Locally

### Option A: Standard Setup (No Docker Needed)

#### 1. Start the Python Django Backend
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
python manage.py makemigrations ingestion
python manage.py migrate
python manage.py seed_esg
python manage.py runserver
```

#### 2. Start the React Frontend
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

### Option B: Unified Container Setup (Requires Docker)
Run the entire stack in one click:
```bash
docker-compose up --build
```
Open **`http://localhost:8000`** in your browser.
