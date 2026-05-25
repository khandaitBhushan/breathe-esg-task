# Architectural & Domain Decisions (DECISIONS.md)

This document chronicles the core ambiguities resolved, domain modeling decisions, assumptions made, and what we would clarify with the Product Manager if we had a synchronous feedback loop.

---

## 1. Ambiguities Resolved & Core Choices

### SAP Fuel & Procurement
*   **Ambiguity**: SAP exports can take many shapes: IDoc (XML files via EDI), OData REST services, BAPIs via RFC, or flat CSV ledger exports.
*   **Our Choice**: We decided to handle **Flat CSV Exports matching a Material Document Ledger (similar to SAP transaction reports like MB51 or ME2N)**.
*   **Why**: In enterprise settings, security teams and SAP administrators routinely delay direct API integrations by 6–18 months. However, configuring SAP to drop a scheduled nightly flat CSV file to a secure SFTP server is relatively standard. ESG teams can start onboarding immediately without waiting for API access.
*   **Subset Handled**: 
    *   Material descriptions containing key terms (e.g., "DIESEL", "HEATING OIL") are auto-extracted as Scope 1 (Stationary Combustion).
    *   Other purchasing lines (e.g. "OFFICE SUPPLIES", "LAPTOPS") are processed as Scope 3, Category 1 (Purchased Goods and Services) using a spend-based emission factor.
    *   Debit/Credit indicators (`SHKZG = S` or `H`) are evaluated to automatically scale quantities, making sure reversals subtract emissions.
*   **Subset Ignored**: Multi-currency exchange rate tables. We assume the corporate tenant's local base currency (e.g., USD) for all spend records. Complex SAP material hierarchies (BOMs) are ignored.

### Utility Electricity Data
*   **Ambiguity**: Electricity billing cycles do not align with calendar months (e.g., a bill spanning December 14 to January 15). Reports usually demand calendar-aligned emissions (e.g., January Scope 2).
*   **Our Choice**: We implemented an **Interval Daily Proration Engine**.
*   **Why**: Simply assigning the entire bill's emissions to the month of the "end date" introduces massive statistical distortion when billing cycles shift. By splitting the bill into daily shares, we calculate emissions per day and aggregate them cleanly into exact calendar-month boundaries.
*   **Subset Handled**: Active energy consumption (`UsageKWh`), billing start/end dates, meter identifiers (`MeterNumber` / `ServiceAgreementID` mapped to facility grid mixes).
*   **Subset Ignored**: Demand charges (`kW` spikes), reactive power factors (kVArh), and localized time-of-use (TOU) tariff shifts, which affect financial cost but have no bearing on carbon calculations.

### Corporate Travel API
*   **Ambiguity**: Flight records returned by travel portals (like Concur or Navan) are notoriously messy. They include multi-segment layovers, occasionally lack mileage data, and record various cabin classes.
*   **Our Choice**: We simulated a **Restful JSON API connection pulling detailed travel logs**.
*   **Why**: Travel portals have highly standardized API payloads. Using JSON lets us model complex, nested trip structures (flights, hotels, car rentals) in a single ingest job.
*   **Subset Handled**:
    *   *Flights*: IATA airport code extraction (`origin_airport`, `destination_airport`). If distance is missing, we compute the Great-Circle distance using the **Haversine formula** based on coordinates in our pre-seeded `Airport` table.
    *   *Cabin Class*: Map cabin classes (`Economy`, `Business`, `First`) to DEFRA-aligned emission factors (e.g. Business class has a higher multiplier due to space footprint).
    *   *Hotels*: Normalized to room-nights, applying regional multipliers.
    *   *Ground/Car*: Distance-based fuel type emissions.
*   **Subset Ignored**: Layovers and indirect routing. If a trip is JFK -> LHR -> DXB, and is reported as a single trip with the raw codes, we calculate it as direct segments. Cancellations are ignored (assumed filtered by the source platform).

---

## 2. What We Would Ask the PM

If we could hop on a quick call with the Product Manager, these would be our top 3 questions:

1.  **"How should we handle multi-currency conversions for global SAP exports?"**
    *   *Context*: If a company operates in Germany (`EUR`), the US (`USD`), and India (`INR`), the SAP export files will contain mixed currency values. Should our ingestion engine fetch live daily spot conversion rates, or should we rely on a fixed monthly corporate treasury exchange rate table uploaded by the client?
2.  **"Are utility portals scraped or integrated via Green Button?"**
    *   *Context*: Facilities teams often use third-party scraping utilities that are brittle and break when the utility portal changes its HTML. If they support "Green Button Connect My Data" (an industry-standard XML/JSON OAuth standard), we should pivot our ingestion pipeline to support Green Button API feeds instead of portal CSV uploads.
3.  **"What is the tolerance threshold for flagging 'suspicious' records?"**
    *   *Context*: We've built an anomaly detector that flags records as `FLAGGED` if the current month's usage is $300\%$ higher than the average of the last $3$ months for that facility. What is the target threshold? Should analysts be able to customize these thresholds per facility or per scope?

---

## 3. Scope Boundaries (Handled vs. Ignored)

| Source | Handled in Prototype | Ignored for Scope / Simplicity |
| :--- | :--- | :--- |
| **SAP** | Material document flat ledger (AL11 / MB51 style CSV), plant lookup (`WERKS`), posting dates, unit standardizations (`L`, `KG`), debit/credit reversals (`SHKZG`). | Direct RFC connections, SAP IDoc segment parsing (extremely nested), OData service authentication protocols, multi-currency conversion tables. |
| **Utility** | Billing interval proration, meter-to-facility linking, local grid mix coefficients based on facility region, missing meter mapping alerts. | Tiered peak-demand pricing structures, solar net-energy metering (NEM) credits, commercial tenant subleases. |
| **Travel** | Haversine flight distance calculations via pre-seeded IATA codes, cabin-class emission scaling, hotel stay counts, vehicle fuel type classification. | Train layovers, private charter jets, luggage weight emissions, employee commute logs. |
