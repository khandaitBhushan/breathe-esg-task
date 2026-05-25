# Data Source Analysis & Mock Data Spec (SOURCES.md)

This document outlines the real-world research behind our three data sources (SAP, Utility portal, and Travel API), explains why our sample mock data is designed the way it is, and details what would break in a real production deployment.

---

## 1. SAP Fuel & Procurement Export

### Real-World Format Researched & Learnings
*   **Source Research**: SAP ERP outputs material transactions via the `MB51` transaction (Goods Movement Ledger) or standard purchasing records.
*   **What We Learned**: 
    1.  SAP column headers are short, technical German/English abbreviations (e.g. `WERKS` for Plant/Facility, `SHKZG` for Debit/Credit, `MEINS` for base unit of measure).
    2.  Units are often non-standard (e.g., `L` for Liters, `KG` for Kilograms, `ST` for Stück/Pieces).
    3.  Dates are printed in raw strings like `YYYYMMDD` (e.g., `20260515` for May 15, 2026).
    4.  Debit/Credit indicator `SHKZG` contains `S` (Soll - Debit/Addition of material) or `H` (Haben - Credit/Material returns). Carbon calculations must subtract the quantity if the indicator is `H`.

### Mock Data Structure
We provide a CSV file with typical SAP columns:
*   `MANDT` (Client ID)
*   `BUKRS` (Company Code)
*   `WERKS` (Plant/Facility Code - maps to Facility)
*   `MATNR` (Material ID)
*   `MAKTX` (Material Name - e.g. "DIESEL FUEL", "HEATING OIL", "OFFICE LAPTOPS")
*   `MENGE` (Quantity)
*   `MEINS` (SAP Unit of Measure)
*   `WRBTR` (Cost Amount in local currency)
*   `WAERS` (Currency)
*   `BUDAT` (Posting Date in YYYYMMDD string format)
*   `SHKZG` (Debit/Credit Indicator: `S` or `H`)

*Example Row:*
`100,US01,FAC-NY-01,MAT-D-12,DIESEL FUEL,500.0,L,1350.0,USD,20260415,S`

### What Would Break in Production
1.  **Custom Date Formats**: In some SAP instances, dates are exported as `DD.MM.YYYY` or `MM/DD/YYYY` depending on the SAP server locale.
2.  **Unmapped Material Codes**: New material IDs added to SAP will not align with Scope 1/3 rules. Our pipeline handles this by placing unrecognized materials into Scope 3 spend-based categorization by default and flagging them for review.
3.  **Missing Facility Codes**: If SAP includes a new `WERKS` (Plant Code) that is not pre-registered in our database, the record is flagged as `FLAGGED` ("Plant code WERKS has no matching facility mapping").

---

## 2. Utility Electricity Portal Export

### Real-World Format Researched & Learnings
*   **Source Research**: Commercial utility portals (like PG&E, Southern California Edison, or EDF).
*   **What We Learned**:
    1.  Utilities identify physical locations using a combination of `ServiceAgreementID` (Account) and `MeterNumber`.
    2.  Billing periods (start/end dates) rarely align with clean calendar months (e.g., spanning Jan 12 to Feb 10).
    3.  Consumption is reported in kilowatt-hours (`KWH`), but some large commercial meters export in megawatt-hours (`MWH`) or watt-hours (`WH`), requiring dynamic scale normalization.

### Mock Data Structure
We provide a CSV file with typical electric utility columns:
*   `ServiceAgreementID` (Account Number)
*   `MeterNumber` (Physical Meter ID)
*   `BillingStartDate` (YYYY-MM-DD date string)
*   `BillingEndDate` (YYYY-MM-DD date string)
*   `UsageKWh` (Total electricity consumption)
*   `DemandKW` (Peak electricity demand)
*   `TariffCode` (Rates classification - e.g. E-19, TOU-8)
*   `TotalAmountPaid` (USD cost)

*Example Row:*
`SA-8839211,MTR-552,2026-04-12,2026-05-11,15000.0,120.0,E-19,3750.0`

### What Would Break in Production
1.  **Overlapping Bills**: If a facilities analyst uploads overlapping date ranges for the same meter, it could double-count emissions. Our backend checks the database for existing meter billing periods and throws a validation error for overlapping intervals.
2.  **Meter Replacements**: When physical utility meters are replaced, the meter ID changes. If the new `MeterNumber` is not updated in the facility lookup, the records will flag.
3.  **Estimated vs. Actual Readings**: Utility CSVs often mark readings as "Estimated" (when physical checks are missed). Real systems must tag records as `ESTIMATED` vs `ACTUAL` for audit rigor.

---

## 3. Corporate Travel API (Concur/Navan Simulation)

### Real-World Format Researched & Learnings
*   **Source Research**: Concur Travel API v4 or Navan standard reporting feeds.
*   **What We Learned**:
    1.  Travel feeds report nested JSON hierarchies containing air segments, hotel bookings, and ground transport logs.
    2.  Flight records frequently omit distances (`distance_miles`), supplying only standard IATA codes (e.g., `SFO`, `LHR`).
    3.  Cabin class (Economy vs Business/First) alters emissions dramatically (Business has a ~$3\times$ higher radiative forcing factor due to seat density).
    4.  Hotel emissions are based on the number of room-nights and the specific country factor where the hotel is located.

### Mock Data Structure
We provide a nested JSON payload structured like a Concur Travel API response:
```json
{
  "trip_id": "TRP-99211",
  "employee_email": "jane.doe@enterprise.com",
  "booking_date": "2026-04-20",
  "segments": [
    {
      "segment_id": "SEG-01",
      "type": "FLIGHT",
      "origin_airport": "SFO",
      "destination_airport": "LHR",
      "cabin_class": "Business"
    },
    {
      "segment_id": "SEG-02",
      "type": "HOTEL",
      "check_in": "2026-04-21",
      "check_out": "2026-04-25",
      "room_nights": 4,
      "city": "London",
      "country": "United Kingdom"
    },
    {
      "segment_id": "SEG-03",
      "type": "GROUND_TRANSPORT",
      "vehicle_type": "Gasoline",
      "distance_km": 45.0
    }
  ]
}
```

### What Would Break in Production
1.  **Unrecognized Airport Codes**: If an employee books a flight to a new regional airport not pre-registered in our local `Airport` table, our Haversine calculator will fail to look up coordinates. In this case, the backend flags the record as `FLAGGED` ("IATA code ABC is not recognized. Distance could not be calculated").
2.  **Multidirectional Trips**: Connecting flights (e.g., SFO -> JFK -> LHR) are sometimes reported as a single fare segment, masking the layover detour distance.
3.  **Third-Party Booking Outliers**: Flights booked manually outside the corporate system are missing from the API feed and require manual paste tools, which our UI supports.
