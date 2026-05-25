# Architectural Tradeoffs (TRADEOFFS.md)

To deliver a production-grade prototype within a 4-day timeline, we prioritized a rock-solid core data model, precise calculation engines, and a premium analyst user experience. In doing so, we made deliberate, strategic tradeoffs to exclude three complex features that would have added instability, cost, or operational overhead.

Here is what we chose **not to build**, why, and how the current architecture handles the gap.

---

## 1. Automated OCR & PDF Parsing for Utility Bills

### What we did not build
An automated Optical Character Recognition (OCR) pipeline (using tools like `Tesseract OCR` or `AWS Textract`) to ingest raw PDF utility bills.

### Why we made this choice
1.  **High Brittleness**: Electric utilities across the globe (PG&E, Con Edison, EDF, National Grid) have completely different bill layouts. A minor template update by the utility breaks custom regex parser scripts instantly.
2.  **Inaccurate Calculations**: ESG reports are subject to rigorous third-party auditing. OCR pipelines routinely misread decimal points (e.g., parsing `500.0 kWh` as `5000 kWh`), introducing unacceptable statistical errors.
3.  **Complex Setup**: OCR engines require large system dependencies (like ghostscript or tesseract-ocr binaries), which complicate cloud deployments and slow down CI/CD pipelines.

### Our Alternative Approach
We prioritized **Portal CSV Exports**. Every modern utility portal allows commercial facilities managers to export tabular energy logs containing billing cycles and usage data. CSV formats are highly structured, clean, and can be parsed with $100\%$ accuracy via our ingestion pipeline, eliminating reading errors.

---

## 2. Dynamic, External Live Currency Conversion Integration

### What we did not build
A live API connection to an external currency exchange rate service (e.g., OpenExchangeRates) to convert multi-currency SAP procurement lines dynamically during ingestion.

### Why we made this choice
1.  **Network Dependencies & Flakiness**: Integrating external APIs introduces point-of-failure vulnerabilities (network outages, API rate limits, SSL failures) during bulk ingestion jobs.
2.  **Audit Stability**: Exchange rates fluctuate daily. If the system fetches rates in real-time without controls, reprocessing the same SAP file at different times can yield slightly different spend totals. This violates the ESG auditor's requirement for deterministic calculations.
3.  **Complexity**: Managing API secret keys adds security overhead to cloud deployments.

### Our Alternative Approach
We designed the database to process spend in a designated **base currency (e.g., USD)**. If multi-currency support is needed, we would implement a dedicated currency table in the database that stores fixed monthly exchange rates. This ensures that calculations remain $100\%$ deterministic, auditable, and fully offline-friendly.

---

## 3. Real-time Multi-Leg Flight Spatial Routing & Live Air Travel APIs

### What we did not build
A real-time aviation routing integration that queries active radar flight logs or complex multi-leg flight paths (e.g., calculating detour miles, headwind delays, or terminal holding patterns).

### Why we made this choice
1.  **Cost and Latency**: Aviation databases require premium subscriptions and introduce heavy latency (often exceeding $2$ seconds per query), which bottlenecks batch ingestion of thousands of corporate travel logs.
2.  **Diminishing Returns**: The marginal carbon difference between a Great-Circle distance calculation and a radar-tracked flight path is extremely small (typically $<3\%$). 
3.  **Offline Capability**: We wanted our pipeline to calculate distances instantly, offline, and without credentials.

### Our Alternative Approach
We pre-seeded a local, high-speed **`Airport` Coordinates Lookup Table** inside our database. When flight miles are omitted, our backend immediately computes the Great-Circle distance between the origin and destination IATA codes using the mathematical **Haversine formula**. This provides a lightning-fast, zero-cost, and deterministic calculation that is perfectly aligned with GHG Protocol Corporate Standard travel estimations.
