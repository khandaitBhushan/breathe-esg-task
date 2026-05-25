# Data Model Specification (MODEL.md)

This document describes the database schema designed for Breathe ESG's ingestion, normalization, and review platform. The model supports strict multi-tenancy, precise carbon categorization, complete lineage tracking (raw to normalized), automatic proration, and full field-level audit logging suitable for financial-grade ESG reporting.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    Tenant ||--o{ User : belongs_to
    Tenant ||--o{ Facility : owns
    Tenant ||--o{ SourceConnection : configures
    Tenant ||--o{ IngestionJob : executes
    Tenant ||--o{ NormalizedActivity : tracks
    
    IngestionJob ||--o{ RawRecord : contains
    Facility ||--o{ NormalizedActivity : contains
    
    RawRecord ||--o? NormalizedActivity : normalizes_to
    NormalizedActivity ||--o{ AuditTrail : logs_changes
    
    Airport ||--o{ NormalizedActivity : calculates_distance
```

---

## Database Schema Reference

### 1. `Tenant` (Multi-Tenancy Root)
Isolates all operations. Multi-tenancy is enforced at the database query level by filtering on `tenant_id`.
*   `id` (`UUID`, Primary Key)
*   `name` (`VARCHAR(255)`)
*   `created_at` (`TIMESTAMP`, Auto Now Add)

### 2. `Facility` (Asset/Plant mapping)
Physical or organizational boundaries. Maps raw identifiers (like SAP plant codes or utility meter numbers) to physical places.
*   `id` (`UUID`, Primary Key)
*   `tenant_id` (`UUID`, Foreign Key to `Tenant`)
*   `name` (`VARCHAR(255)`) - e.g., "Munich Factory", "San Francisco HQ"
*   `facility_code` (`VARCHAR(50)`, Unique index within tenant) - e.g., plant code `1000` or meter number `MTR-99211`
*   `country` (`VARCHAR(100)`) - Used for localized hotel factors
*   `region` (`VARCHAR(100)`) - Used for grid-mix factors (e.g., eGRID subregion `CAMX` for California)

### 3. `SourceConnection`
Configures credentials and endpoints for data streams.
*   `id` (`UUID`, Primary Key)
*   `tenant_id` (`UUID`, Foreign Key to `Tenant`)
*   `name` (`VARCHAR(255)`) - e.g., "SAP SFTP Export", "PG&E Portal Scrape", "Corporate Travel API"
*   `source_type` (`VARCHAR(50)`) - Enum: `SAP`, `UTILITY`, `TRAVEL`
*   `connection_details` (`JSON`) - Secure configurations, paths, or simulated endpoints

### 4. `IngestionJob`
A ledger recording every pipeline run. Tracks ingestion attempts and execution metadata.
*   `id` (`UUID`, Primary Key)
*   `tenant_id` (`UUID`, Foreign Key to `Tenant`)
*   `source_connection_id` (`UUID`, Foreign Key to `SourceConnection`)
*   `status` (`VARCHAR(50)`) - Enum: `RUNNING`, `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED`
*   `filename` (`VARCHAR(255)`, Nullable) - Name of the uploaded file
*   `file_hash` (`VARCHAR(64)`, Nullable) - SHA-256 hash of file content to prevent duplicate uploads
*   `started_at` (`TIMESTAMP`, Auto Now Add)
*   `completed_at` (`TIMESTAMP`, Nullable)
*   `records_processed` (`INTEGER`, Default 0)
*   `records_failed` (`INTEGER`, Default 0)
*   `logs` (`TEXT`, Nullable) - Error stacktraces, parsing warnings, or details on failed rows

### 5. `RawRecord` (Source of Truth Traceability)
Preserves immutable source data. Analysts can drill down from any normalized carbon row directly to its original, raw JSON/CSV string.
*   `id` (`UUID`, Primary Key)
*   `tenant_id` (`UUID`, Foreign Key to `Tenant`)
*   `ingestion_job_id` (`UUID`, Foreign Key to `IngestionJob`)
*   `raw_payload` (`JSON`) - Stores original unparsed row fields (e.g. `{"MANDT": "100", "WERKS": "1000", ...}`)
*   `status` (`VARCHAR(50)`) - Enum: `PENDING`, `NORMALIZED`, `FAILED`
*   `error_message` (`TEXT`, Nullable)
*   `ingested_at` (`TIMESTAMP`, Auto Now Add)

### 6. `NormalizedActivity` (Core ESG Ledger)
The centralized transaction ledger where all activities are standardized, emissions are calculated, and sign-offs occur.
*   `id` (`UUID`, Primary Key)
*   `tenant_id` (`UUID`, Foreign Key to `Tenant`)
*   `raw_record_id` (`UUID`, Foreign Key to `RawRecord`, Nullable)
*   `facility_id` (`UUID`, Foreign Key to `Facility`, Nullable)
*   `activity_type` (`VARCHAR(50)`) - Enum: `FUEL`, `PROCUREMENT`, `ELECTRICITY`, `FLIGHT`, `HOTEL`, `GROUND_TRANSPORT`
*   `scope` (`VARCHAR(10)`) - Enum: `SCOPE_1`, `SCOPE_2`, `SCOPE_3`
*   `ghg_category` (`VARCHAR(255)`) - e.g., "Stationary Combustion", "Category 1: Purchased Goods and Services", "Category 6: Business Travel"
*   `start_date` (`DATE`)
*   `end_date` (`DATE`)
*   `raw_quantity` (`DECIMAL(18, 4)`) - Quantity in original source units
*   `raw_unit` (`VARCHAR(50)`) - Original unit (e.g., `GALLONS`, `MWH`, `MILES`)
*   `normalized_quantity` (`DECIMAL(18, 4)`) - Standardized quantity in target unit
*   `normalized_unit` (`VARCHAR(50)`) - Standard unit (e.g., `L`, `KWH`, `USD`, `KM`, `ROOM_NIGHT`)
*   `co2e_kg` (`DECIMAL(18, 4)`) - Calculated CO2 equivalent in kilograms
*   `emission_factor_used` (`VARCHAR(255)`) - Source of factor (e.g., "EPA 2023 Camx Grid Mix: 0.22 kg/kWh")
*   `status` (`VARCHAR(50)`) - Enum: `PENDING_REVIEW`, `APPROVED`, `FLAGGED`, `REJECTED`, `AUDIT_LOCKED`
*   `flag_reason` (`TEXT`, Nullable) - Explain warning triggers (e.g., "Usage exceeds facility historical average by >300%")
*   `created_at` (`TIMESTAMP`, Auto Now Add)
*   `updated_at` (`TIMESTAMP`, Auto Now)

### 7. `AuditTrail` (Audit Ledger)
Immutable history of all human corrections, flags, and approvals. Crucial for satisfying third-party assurance audits.
*   `id` (`UUID`, Primary Key)
*   `normalized_activity_id` (`UUID`, Foreign Key to `NormalizedActivity`)
*   `user_id` (`INTEGER`, Foreign Key to Django User, Nullable)
*   `action` (`VARCHAR(50)`) - Enum: `CREATE`, `UPDATE`, `APPROVE`, `FLAG`, `REJECT`, `LOCK`
*   `field_name` (`VARCHAR(100)`, Nullable) - e.g., `co2e_kg`, `normalized_quantity` (null if bulk action)
*   `old_value` (`TEXT`, Nullable)
*   `new_value` (`TEXT`, Nullable)
*   `comment` (`TEXT`, Nullable) - Explanation written by analyst during audit or automated override
*   `timestamp` (`TIMESTAMP`, Auto Now Add)

### 8. `Airport` (Geospatial Lookup)
Global flight coordinates used to resolve distances dynamically from IATA codes.
*   `iata_code` (`VARCHAR(3)`, Primary Key) - e.g., `SFO`, `LHR`
*   `name` (`VARCHAR(255)`)
*   `city` (`VARCHAR(100)`)
*   `country` (`VARCHAR(100)`)
*   `latitude` (`DECIMAL(9, 6)`)
*   `longitude` (`DECIMAL(9, 6)`)

---

## Technical Design Decisions

### A. Strict Multi-Tenancy Isolation
Every data-access query, file upload, or analyst edit is filtered programmatically by the logged-in `tenant_id`. 
*   An analyst associated with *Client A* is blocked from retrieving, updating, or even triggering ingestion for *Client B*. 
*   Even helper entities like `Facility` are strictly owned by a single `Tenant`, preventing lookup collisions between plant numbers (e.g. Facility Code `1000` mapped to Client A's facility, and Facility Code `1000` mapped to Client B's facility).

### B. Unit Standardization Engine
Data ingestion normalizes raw input metrics into standard base quantities. This guarantees accurate aggregation across diverse operations:
*   **Fuel**: Converted to standard Liters (`L`). (e.g. Gallons $\times$ $3.78541$, Cubic Meters $\times$ $1000$).
*   **Electricity**: Converted to standard kilowatt-hours (`KWH`). (e.g. MWh $\times$ $1000$, Wh / $1000$).
*   **Business Travel (Flights & Ground)**: Converted to standard kilometers (`KM`). (e.g. Miles $\times$ $1.60934$).
*   **Business Travel (Hotels)**: Converted to standard room-nights (`ROOM_NIGHT`).
*   **Spend**: Standardized to base local currency (e.g., `USD`).

### C. Change Traceability (Lineage and Audit Trail)
When an analyst adjusts a row (e.g., corrects a meter reading entered as $5,000$ instead of $500$):
1.  The `NormalizedActivity` is updated.
2.  An `AuditTrail` record is appended logging the exact field modified, the old value (`5000`), the new value (`500`), the user ID of the editor, and a required comment explanation.
3.  The relationship link to the raw `RawRecord` is kept fully intact, allowing auditors to inspect the original billing text file that matches the revised entry.
4.  Once approved, the status is set to `AUDIT_LOCKED`, which blocks further API writes to this row.
