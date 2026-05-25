import csv
import io
import json
import math
import hashlib
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Sum, Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    Tenant,
    Facility,
    SourceConnection,
    IngestionJob,
    RawRecord,
    NormalizedActivity,
    AuditTrail,
    Airport
)
from .serializers import (
    TenantSerializer,
    FacilitySerializer,
    SourceConnectionSerializer,
    IngestionJobSerializer,
    RawRecordSerializer,
    NormalizedActivitySerializer
)

# Helper function to get tenant from request header (X-Tenant-ID)
def get_tenant_from_request(request):
    tenant_id = request.headers.get("X-Tenant-ID") or request.query_params.get("tenant_id")
    if tenant_id:
        try:
            # Validate UUID string format to prevent Postgres transaction abortion
            uuid.UUID(str(tenant_id))
            return Tenant.objects.get(id=tenant_id)
        except (Tenant.DoesNotExist, ValueError):
            pass
    # Default to first tenant or create one if none exists
    tenant = Tenant.objects.first()
    if not tenant:
        tenant = Tenant.objects.create(name="Default Enterprise Tenant")
    return tenant

# Standard User for audit trails
def get_audit_user():
    user = User.objects.first()
    if not user:
        user = User.objects.create_superuser("admin", "admin@breatheesg.com", "password")
    return user

# Mathematical Haversine Distance Calculation (Earth radius = 6371.0 km)
def calculate_haversine(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    return 6371.0 * c

# Interval Daily Proration Engine for overlapping months
def run_proration_engine(start_date, end_date, total_kwh, total_cost):
    total_days = (end_date - start_date).days + 1
    if total_days <= 0:
        return []
    
    daily_kwh = float(total_kwh) / total_days
    daily_cost = float(total_cost) / total_days
    
    shares = {}
    current_date = start_date
    while current_date <= end_date:
        key = (current_date.year, current_date.month)
        if key not in shares:
            shares[key] = {
                "days": 0,
                "start": current_date,
                "end": current_date
            }
        shares[key]["days"] += 1
        shares[key]["end"] = current_date
        current_date += timedelta(days=1)
        
    results = []
    for key, data in shares.items():
        results.append({
            "start_date": data["start"],
            "end_date": data["end"],
            "kwh": daily_kwh * data["days"],
            "cost": daily_cost * data["days"],
            "days": data["days"]
        })
    return results

# Outlier Anomaly Detection Engine (flags usage > 300% of facility historical 3-month average)
def detect_anomaly(facility, activity_type, current_qty, start_date):
    if not facility:
        return False, None
    
    # Calculate historical average for the same activity type at this facility
    three_months_ago = start_date - timedelta(days=90)
    history = NormalizedActivity.objects.filter(
        facility=facility,
        activity_type=activity_type,
        start_date__gte=three_months_ago,
        start_date__lt=start_date,
        status__in=["APPROVED", "AUDIT_LOCKED"]
    )
    
    if not history.exists():
        # Check overall history if no recent 3 months data
        history = NormalizedActivity.objects.filter(
            facility=facility,
            activity_type=activity_type,
            status__in=["APPROVED", "AUDIT_LOCKED"]
        )
        
    if history.exists():
        avg_qty = history.aggregate(Avg("normalized_quantity"))["normalized_quantity__avg"]
        if avg_qty and avg_qty > 0:
            threshold = float(avg_qty) * 3.0 # 300%
            if float(current_qty) > threshold:
                pct = int((float(current_qty) / float(avg_qty)) * 100)
                return True, f"Quantity of {current_qty} is {pct}% of historical facility average ({avg_qty:.2f})"
                
    return False, None

# ----------------- ENDPOINTS -----------------

@api_view(["GET"])
def get_tenant_info(request):
    tenant = get_tenant_from_request(request)
    return Response(TenantSerializer(tenant).data)

@api_view(["GET", "POST"])
def facility_list(request):
    tenant = get_tenant_from_request(request)
    if request.method == "GET":
        facilities = Facility.objects.filter(tenant=tenant)
        return Response(FacilitySerializer(facilities, many=True).data)
    elif request.method == "POST":
        data = request.data.copy()
        data["tenant"] = tenant.id
        serializer = FacilitySerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(["GET"])
def connection_list(request):
    tenant = get_tenant_from_request(request)
    connections = SourceConnection.objects.filter(tenant=tenant)
    return Response(SourceConnectionSerializer(connections, many=True).data)

@api_view(["GET"])
def job_list(request):
    tenant = get_tenant_from_request(request)
    jobs = IngestionJob.objects.filter(tenant=tenant).order_by("-started_at")[:50]
    return Response(IngestionJobSerializer(jobs, many=True).data)

@api_view(["GET"])
def record_list(request):
    tenant = get_tenant_from_request(request)
    records = NormalizedActivity.objects.filter(tenant=tenant).order_by("-start_date")
    
    # Filtering
    status_filter = request.query_params.get("status")
    if status_filter:
        records = records.filter(status=status_filter)
        
    activity_filter = request.query_params.get("activity_type")
    if activity_filter:
        records = records.filter(activity_type=activity_filter)
        
    scope_filter = request.query_params.get("scope")
    if scope_filter:
        records = records.filter(scope=scope_filter)
        
    facility_filter = request.query_params.get("facility_id")
    if facility_filter:
        records = records.filter(facility_id=facility_filter)
        
    search = request.query_params.get("search")
    if search:
        records = records.filter(
            Q(ghg_category__icontains=search) |
            Q(raw_unit__icontains=search) |
            Q(facility__name__icontains=search)
        )
        
    serializer = NormalizedActivitySerializer(records, many=True)
    return Response(serializer.data)

@api_view(["POST"])
def approve_record(request, pk):
    tenant = get_tenant_from_request(request)
    try:
        record = NormalizedActivity.objects.get(id=pk, tenant=tenant)
    except NormalizedActivity.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)
        
    if record.status == "AUDIT_LOCKED":
        return Response({"error": "Cannot approve locked records"}, status=status.HTTP_400_BAD_REQUEST)
        
    user = get_audit_user()
    old_status = record.status
    record.status = "APPROVED"
    record.save()
    
    AuditTrail.objects.create(
        normalized_activity=record,
        user=user,
        action="APPROVE",
        field_name="status",
        old_value=old_status,
        new_value="APPROVED",
        comment=request.data.get("comment", "Approved by analyst review.")
    )
    return Response(NormalizedActivitySerializer(record).data)

@api_view(["POST"])
def edit_record(request, pk):
    tenant = get_tenant_from_request(request)
    try:
        record = NormalizedActivity.objects.get(id=pk, tenant=tenant)
    except NormalizedActivity.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)
        
    if record.status == "AUDIT_LOCKED":
        return Response({"error": "Cannot edit locked records"}, status=status.HTTP_400_BAD_REQUEST)
        
    user = get_audit_user()
    comment = request.data.get("comment", "Corrected by analyst.")
    
    fields_to_update = ["start_date", "end_date", "raw_quantity", "normalized_quantity", "co2e_kg"]
    changes = []
    
    with transaction.atomic():
        for field in fields_to_update:
            if field in request.data:
                old_val = str(getattr(record, field))
                new_val = str(request.data[field])
                if old_val != new_val:
                    # Update
                    if field in ["start_date", "end_date"]:
                        setattr(record, field, datetime.strptime(new_val, "%Y-%m-%d").date())
                    else:
                        setattr(record, field, Decimal(new_val))
                        
                    changes.append((field, old_val, new_val))
        
        # Always change status to approved when edited
        old_status = record.status
        record.status = "APPROVED"
        record.save()
        
        # Log all changes
        for field, old_val, new_val in changes:
            AuditTrail.objects.create(
                normalized_activity=record,
                user=user,
                action="UPDATE",
                field_name=field,
                old_value=old_val,
                new_value=new_val,
                comment=comment
            )
            
        AuditTrail.objects.create(
            normalized_activity=record,
            user=user,
            action="APPROVE",
            field_name="status",
            old_value=old_status,
            new_value="APPROVED",
            comment=f"Auto-approved after editing. Reason: {comment}"
        )
        
    return Response(NormalizedActivitySerializer(record).data)

@api_view(["POST"])
def lock_records(request):
    tenant = get_tenant_from_request(request)
    record_ids = request.data.get("record_ids", [])
    user = get_audit_user()
    
    updated_records = []
    with transaction.atomic():
        records = NormalizedActivity.objects.filter(id__in=record_ids, tenant=tenant, status="APPROVED")
        for record in records:
            record.status = "AUDIT_LOCKED"
            record.save()
            
            AuditTrail.objects.create(
                normalized_activity=record,
                user=user,
                action="LOCK",
                field_name="status",
                old_value="APPROVED",
                new_value="AUDIT_LOCKED",
                comment="Locked for audit report."
            )
            updated_records.append(record.id)
            
    return Response({"locked_count": len(updated_records), "record_ids": updated_records})

@api_view(["POST"])
def reject_record(request, pk):
    tenant = get_tenant_from_request(request)
    try:
        record = NormalizedActivity.objects.get(id=pk, tenant=tenant)
    except NormalizedActivity.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)
        
    if record.status == "AUDIT_LOCKED":
        return Response({"error": "Cannot reject locked records"}, status=status.HTTP_400_BAD_REQUEST)
        
    user = get_audit_user()
    old_status = record.status
    record.status = "REJECTED"
    record.save()
    
    AuditTrail.objects.create(
        normalized_activity=record,
        user=user,
        action="REJECT",
        field_name="status",
        old_value=old_status,
        new_value="REJECTED",
        comment=request.data.get("comment", "Rejected by analyst review.")
    )
    return Response(NormalizedActivitySerializer(record).data)

@api_view(["GET"])
def get_dashboard_stats(request):
    tenant = get_tenant_from_request(request)
    activities = NormalizedActivity.objects.filter(tenant=tenant)
    
    # Calculate stats
    total_co2e = float(activities.exclude(status="REJECTED").aggregate(Sum("co2e_kg"))["co2e_kg__sum"] or 0)
    
    # Scopes
    scope1 = float(activities.filter(scope="SCOPE_1").exclude(status="REJECTED").aggregate(Sum("co2e_kg"))["co2e_kg__sum"] or 0)
    scope2 = float(activities.filter(scope="SCOPE_2").exclude(status="REJECTED").aggregate(Sum("co2e_kg"))["co2e_kg__sum"] or 0)
    scope3 = float(activities.filter(scope="SCOPE_3").exclude(status="REJECTED").aggregate(Sum("co2e_kg"))["co2e_kg__sum"] or 0)
    
    # Facilities CO2 Breakdown
    facilities_data = []
    for f in Facility.objects.filter(tenant=tenant):
        fac_co2 = float(activities.filter(facility=f).exclude(status="REJECTED").aggregate(Sum("co2e_kg"))["co2e_kg__sum"] or 0)
        facilities_data.append({
            "name": f.name,
            "code": f.facility_code,
            "co2e_kg": fac_co2
        })
        
    # Categories Breakdown
    categories_data = {}
    for act in activities.exclude(status="REJECTED"):
        cat = act.ghg_category
        categories_data[cat] = categories_data.get(cat, 0.0) + float(act.co2e_kg)
        
    formatted_categories = [{"name": k, "co2e_kg": v} for k, v in categories_data.items()]
    
    # Data Quality Validation State Counts
    total_records = activities.count()
    pending = activities.filter(status="PENDING_REVIEW").count()
    approved = activities.filter(status="APPROVED").count()
    flagged = activities.filter(status="FLAGGED").count()
    rejected = activities.filter(status="REJECTED").count()
    locked = activities.filter(status="AUDIT_LOCKED").count()
    
    # Trend over time (monthly grouping)
    # Since we are using SQLite, we can aggregate in Python easily and robustly
    monthly_trend = {}
    for act in activities.exclude(status="REJECTED").order_by("start_date"):
        month_key = act.start_date.strftime("%Y-%m")
        monthly_trend[month_key] = monthly_trend.get(month_key, 0.0) + float(act.co2e_kg)
        
    formatted_trend = [{"month": k, "co2e_kg": v} for k, v in sorted(monthly_trend.items())]

    return Response({
        "total_co2e_kg": total_co2e,
        "scopes": {
            "scope1": scope1,
            "scope2": scope2,
            "scope3": scope3
        },
        "facilities": facilities_data,
        "categories": formatted_categories,
        "quality": {
            "total": total_records,
            "pending_review": pending,
            "approved": approved,
            "flagged": flagged,
            "rejected": rejected,
            "audit_locked": locked
        },
        "trend": formatted_trend
    })

# ----------------- INGESTION PIPELINE -----------------

@api_view(["POST"])
def ingest_data(request):
    tenant = get_tenant_from_request(request)
    source_type = request.data.get("source_type") # "SAP" or "UTILITY" or "TRAVEL"
    
    if not source_type:
        return Response({"error": "Missing source_type parameter"}, status=status.HTTP_400_BAD_REQUEST)
        
    # Get or create SourceConnection
    connection, _ = SourceConnection.objects.get_or_create(
        tenant=tenant,
        source_type=source_type,
        defaults={"name": f"Simulated {source_type} Connection"}
    )
    
    job = IngestionJob.objects.create(
        tenant=tenant,
        source_connection=connection,
        status="RUNNING"
    )
    
    logs = []
    records_processed = 0
    records_failed = 0
    
    try:
        if source_type in ["SAP", "UTILITY"]:
            # Handle File Upload
            file_obj = request.FILES.get("file")
            if not file_obj:
                raise ValueError("No file uploaded")
                
            job.filename = file_obj.name
            
            # Read file bytes & check for duplicate hash
            file_bytes = file_obj.read()
            sha256_hash = hashlib.sha256(file_bytes).hexdigest()
            
            # Check duplicate hash within tenant
            duplicate_job = IngestionJob.objects.filter(
                tenant=tenant, 
                file_hash=sha256_hash, 
                status__in=["SUCCESS", "PARTIAL_SUCCESS"]
            ).first()
            
            if duplicate_job:
                logs.append(f"Warning: File already uploaded in job {duplicate_job.id}. Processing duplicate.")
                
            job.file_hash = sha256_hash
            job.save()
            
            # Parse CSV
            csv_text = file_bytes.decode("utf-8")
            csv_reader = csv.DictReader(io.StringIO(csv_text))
            
            if source_type == "SAP":
                records_processed, records_failed = process_sap_csv(tenant, job, csv_reader, logs)
            elif source_type == "UTILITY":
                records_processed, records_failed = process_utility_csv(tenant, job, csv_reader, logs)
                
        elif source_type == "TRAVEL":
            # API Simulation logic
            payload_data = request.data.get("payload")
            if not payload_data:
                # Use default pre-fabricated mock payload if none provided
                payload_data = get_concur_mock_payload()
            else:
                if isinstance(payload_data, str):
                    payload_data = json.loads(payload_data)
                    
            job.filename = "Concur_API_Response.json"
            job.save()
            
            records_processed, records_failed = process_travel_json(tenant, job, payload_data, logs)
            
        # Complete Job
        job.status = "SUCCESS" if records_failed == 0 else "PARTIAL_SUCCESS"
        job.records_processed = records_processed
        job.records_failed = records_failed
        job.logs = "\n".join(logs)
        job.completed_at = timezone.now()
        job.save()
        
        return Response(IngestionJobSerializer(job).data, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        job.status = "FAILED"
        job.records_processed = records_processed
        job.records_failed = records_failed
        logs.append(f"CRITICAL ERROR: {str(e)}")
        job.logs = "\n".join(logs)
        job.completed_at = timezone.now()
        job.save()
        return Response(IngestionJobSerializer(job).data, status=status.HTTP_400_BAD_REQUEST)

# ----------------- PARSING IMPLEMENTATIONS -----------------

def process_sap_csv(tenant, job, csv_reader, logs):
    processed = 0
    failed = 0
    
    # Seed emission factors
    # Fuel: Diesel (Scope 1) = 2.68 kg/L, Heating Oil = 2.53 kg/L
    # Spend: Procurement Scope 3 = 0.45 kg/USD
    
    for row_idx, row in enumerate(csv_reader):
        try:
            # Save Raw Record
            raw_rec = RawRecord.objects.create(
                tenant=tenant,
                ingestion_job=job,
                raw_payload=row,
                status="PENDING"
            )
            
            # Map required SAP fields
            plant_code = row.get("WERKS")
            material_name = row.get("MAKTX", "").upper()
            qty_str = row.get("MENGE", "0")
            unit = row.get("MEINS", "").upper()
            cost_str = row.get("WRBTR", "0")
            posting_date_str = row.get("BUDAT") # YYYYMMDD
            shkzg = row.get("SHKZG", "S").upper() # S = Debit, H = Credit
            
            if not plant_code or not posting_date_str:
                raise ValueError("Missing critical columns: WERKS or BUDAT")
                
            qty = Decimal(qty_str)
            cost = Decimal(cost_str)
            
            # Parse SAP Date YYYYMMDD
            parsed_date = datetime.strptime(posting_date_str, "%Y%m%d").date()
            
            # Debit/Credit multiplier scaling
            multiplier = Decimal("1.0")
            if shkzg == "H":
                multiplier = Decimal("-1.0")
                
            qty = qty * multiplier
            cost = cost * multiplier
            
            # Find facility
            facility = Facility.objects.filter(tenant=tenant, facility_code=plant_code).first()
            flagged = False
            flag_reason = None
            
            if not facility:
                flagged = True
                flag_reason = f"SAP Plant Code '{plant_code}' could not be resolved to a Facility"
                
            # Classify & calculate emissions
            normalized_qty = qty
            normalized_unit = unit
            co2e_kg = Decimal("0.0")
            emission_factor_desc = ""
            activity_type = ""
            scope = ""
            ghg_cat = ""
            
            if "DIESEL" in material_name:
                activity_type = "FUEL"
                scope = "SCOPE_1"
                ghg_cat = "Stationary Combustion (Fuel)"
                
                # Conversion to Liters if in Gallons (standard SAP unit is L or GAL)
                if unit == "GAL" or unit == "GALLON" or unit == "G":
                    normalized_qty = qty * Decimal("3.78541")
                    normalized_unit = "L"
                else:
                    normalized_unit = "L"
                    
                co2e_kg = normalized_qty * Decimal("2.68")
                emission_factor_desc = "EPA 2023: 2.68 kg CO2e per Liter of Diesel"
                
            elif "HEATING OIL" in material_name or "FUEL OIL" in material_name:
                activity_type = "FUEL"
                scope = "SCOPE_1"
                ghg_cat = "Stationary Combustion (Fuel)"
                normalized_unit = "L"
                if unit == "GAL":
                    normalized_qty = qty * Decimal("3.78541")
                co2e_kg = normalized_qty * Decimal("2.53")
                emission_factor_desc = "EPA 2023: 2.53 kg CO2e per Liter of Heating Oil"
                
            else:
                # Spend-based Procurement Scope 3 Category 1
                activity_type = "PROCUREMENT"
                scope = "SCOPE_3"
                ghg_cat = "Category 1: Purchased Goods and Services"
                normalized_qty = cost
                normalized_unit = "USD"
                co2e_kg = cost * Decimal("0.45")
                emission_factor_desc = "EPA Supply Chain Spend Factor: 0.45 kg CO2e per USD"
                
            # Run outlier detection
            if not flagged and facility:
                is_outlier, reason = detect_anomaly(facility, activity_type, normalized_qty, parsed_date)
                if is_outlier:
                    flagged = True
                    flag_reason = reason
                    
            status_choice = "FLAGGED" if flagged else "PENDING_REVIEW"
            
            # Create Normalized Activity record
            NormalizedActivity.objects.create(
                tenant=tenant,
                raw_record=raw_rec,
                facility=facility,
                activity_type=activity_type,
                scope=scope,
                ghg_category=ghg_cat,
                start_date=parsed_date,
                end_date=parsed_date,
                raw_quantity=Decimal(qty_str),
                raw_unit=row.get("MEINS", ""),
                normalized_quantity=normalized_qty,
                normalized_unit=normalized_unit,
                co2e_kg=co2e_kg,
                emission_factor_used=emission_factor_desc,
                status=status_choice,
                flag_reason=flag_reason
            )
            
            raw_rec.status = "NORMALIZED"
            raw_rec.save()
            processed += 1
            
        except Exception as e:
            failed += 1
            logs.append(f"Row {row_idx + 1} Error: {str(e)}")
            if 'raw_rec' in locals():
                raw_rec.status = "FAILED"
                raw_rec.error_message = str(e)
                raw_rec.save()
                
    return processed, failed

def process_utility_csv(tenant, job, csv_reader, logs):
    processed = 0
    failed = 0
    
    # Grid emissions factors
    # eGRID region grid mix (kg CO2e / kWh)
    # CAMX (CA): 0.22, NYUP (NY): 0.18, Default: 0.38
    
    for row_idx, row in enumerate(csv_reader):
        try:
            # Save Raw Record
            raw_rec = RawRecord.objects.create(
                tenant=tenant,
                ingestion_job=job,
                raw_payload=row,
                status="PENDING"
            )
            
            sa_id = row.get("ServiceAgreementID")
            meter_num = row.get("MeterNumber")
            start_date_str = row.get("BillingStartDate")
            end_date_str = row.get("BillingEndDate")
            kwh_str = row.get("UsageKWh", "0")
            cost_str = row.get("TotalAmountPaid", "0")
            
            if not sa_id or not start_date_str or not end_date_str:
                raise ValueError("Missing critical columns: ServiceAgreementID, BillingStartDate, or BillingEndDate")
                
            total_kwh = Decimal(kwh_str)
            total_cost = Decimal(cost_str)
            
            # Parse dates
            s_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            e_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            
            if s_date > e_date:
                raise ValueError("Start date cannot be after end date")
                
            # Find facility mapped to service agreement / meter
            facility = Facility.objects.filter(
                Q(tenant=tenant) & (Q(facility_code=sa_id) | Q(facility_code=meter_num))
            ).first()
            
            flagged = False
            flag_reason = None
            
            if not facility:
                flagged = True
                flag_reason = f"Utility meter/account '{sa_id}' could not be resolved to a Facility"
                
            # Grid mix factor lookup
            grid_factor = Decimal("0.38")
            grid_desc = "US National Grid Average: 0.38 kg CO2e/kWh"
            if facility:
                reg = facility.region.upper()
                if "CAMX" in reg:
                    grid_factor = Decimal("0.22")
                    grid_desc = "EPA eGRID Camx subregion grid mix: 0.22 kg CO2e/kWh"
                elif "NYUP" in reg:
                    grid_factor = Decimal("0.18")
                    grid_desc = "EPA eGRID Nyup subregion grid mix: 0.18 kg CO2e/kWh"
                    
            # Run proration monthly engine
            shares = run_proration_engine(s_date, e_date, total_kwh, total_cost)
            
            # Generate normalized entries for each split share
            for share in shares:
                share_kwh = Decimal(str(share["kwh"]))
                share_co2e = share_kwh * grid_factor
                
                # Check for duplicates / overlapping billing for this meter
                overlap_exists = NormalizedActivity.objects.filter(
                    tenant=tenant,
                    facility=facility,
                    activity_type="ELECTRICITY",
                    start_date__lte=share["end_date"],
                    end_date__gte=share["start_date"]
                ).exists()
                
                share_flagged = flagged
                share_reason = flag_reason
                
                if overlap_exists and not share_flagged:
                    share_flagged = True
                    share_reason = f"Warning: Overlapping billing cycle found for Billing Period {share['start_date']} to {share['end_date']}"
                    
                # Anomaly checks on prorated monthly share
                if not share_flagged and facility:
                    is_outlier, reason = detect_anomaly(facility, "ELECTRICITY", share_kwh, share["start_date"])
                    if is_outlier:
                        share_flagged = True
                        share_reason = reason
                        
                status_choice = "FLAGGED" if share_flagged else "PENDING_REVIEW"
                
                NormalizedActivity.objects.create(
                    tenant=tenant,
                    raw_record=raw_rec,
                    facility=facility,
                    activity_type="ELECTRICITY",
                    scope="SCOPE_2",
                    ghg_category="Scope 2 Purchased Electricity",
                    start_date=share["start_date"],
                    end_date=share["end_date"],
                    raw_quantity=total_kwh,
                    raw_unit="KWH",
                    normalized_quantity=share_kwh,
                    normalized_unit="KWH",
                    co2e_kg=share_co2e,
                    emission_factor_used=grid_desc,
                    status=status_choice,
                    flag_reason=share_reason
                )
                
            raw_rec.status = "NORMALIZED"
            raw_rec.save()
            processed += 1
            
        except Exception as e:
            failed += 1
            logs.append(f"Row {row_idx + 1} Error: {str(e)}")
            if 'raw_rec' in locals():
                raw_rec.status = "FAILED"
                raw_rec.error_message = str(e)
                raw_rec.save()
                
    return processed, failed

def process_travel_json(tenant, job, payload, logs):
    processed = 0
    failed = 0
    
    # Air Travel factors (DEFRA 2023, Short vs Long haul, cabin metrics) per passenger-km
    # Short (<3700km): Econ = 0.15 kg, Biz = 0.23 kg
    # Long (>3700km): Econ = 0.19 kg, Biz = 0.56 kg
    
    # Hotel factors: USA = 18.5 kg / room-night, UK = 12.2 kg, default = 15.0 kg
    
    # Ground/Car factors: Gasoline = 0.18 kg/km, Diesel = 0.17 kg/km, Electric = 0.05 kg/km
    
    trips = payload if isinstance(payload, list) else [payload]
    
    for trip_idx, trip in enumerate(trips):
        try:
            # Save Raw Record
            raw_rec = RawRecord.objects.create(
                tenant=tenant,
                ingestion_job=job,
                raw_payload=trip,
                status="PENDING"
            )
            
            booking_date_str = trip.get("booking_date", str(date.today()))
            booking_date = datetime.strptime(booking_date_str, "%Y-%m-%d").date()
            segments = trip.get("segments", [])
            
            # Group flights, hotel, ground together as one trip
            for seg_idx, seg in enumerate(segments):
                seg_type = seg.get("type", "").upper()
                
                flagged = False
                flag_reason = None
                facility = Facility.objects.filter(tenant=tenant).first() # Default facility
                
                co2e_kg = Decimal("0.0")
                norm_qty = Decimal("0.0")
                norm_unit = ""
                factor_desc = ""
                act_type = ""
                ghg_cat = "Category 6: Business Travel"
                
                start_date = booking_date
                end_date = booking_date
                
                if seg_type == "FLIGHT":
                    act_type = "FLIGHT"
                    origin = seg.get("origin_airport", "").upper()
                    dest = seg.get("destination_airport", "").upper()
                    cabin = seg.get("cabin_class", "Economy")
                    
                    # Calculate flight distance
                    dist_miles = seg.get("distance_miles")
                    distance_km = 0.0
                    
                    if dist_miles:
                        distance_km = float(dist_miles) * 1.60934
                    else:
                        # Haversine calculation from Airport codes
                        port1 = Airport.objects.filter(iata_code=origin).first()
                        port2 = Airport.objects.filter(iata_code=dest).first()
                        
                        if port1 and port2:
                            distance_km = calculate_haversine(
                                port1.latitude, port1.longitude,
                                port2.latitude, port2.longitude
                            )
                        else:
                            flagged = True
                            flag_reason = f"Airport lookup failed for Origin '{origin}' or Destination '{dest}'. Miles set to 500 default."
                            distance_km = 804.67 # default ~500 miles
                            
                    # Apply flight emission factors based on distance and class
                    is_short_haul = distance_km < 3700.0
                    
                    if "BIZ" in cabin.upper() or "BUSINESS" in cabin.upper():
                        coef = Decimal("0.23") if is_short_haul else Decimal("0.56")
                        factor_desc = f"DEFRA Short-haul Biz: 0.23 kg/km" if is_short_haul else f"DEFRA Long-haul Biz: 0.56 kg/km"
                    else:
                        coef = Decimal("0.15") if is_short_haul else Decimal("0.19")
                        factor_desc = f"DEFRA Short-haul Econ: 0.15 kg/km" if is_short_haul else f"DEFRA Long-haul Econ: 0.19 kg/km"
                        
                    norm_qty = Decimal(str(distance_km))
                    norm_unit = "KM"
                    co2e_kg = norm_qty * coef
                    
                elif seg_type == "HOTEL":
                    act_type = "HOTEL"
                    country = seg.get("country", "USA").upper()
                    nights = int(seg.get("room_nights", 1))
                    
                    # Stay interval
                    ci_str = seg.get("check_in", booking_date_str)
                    co_str = seg.get("check_out", booking_date_str)
                    
                    start_date = datetime.strptime(ci_str, "%Y-%m-%d").date()
                    end_date = datetime.strptime(co_str, "%Y-%m-%d").date()
                    
                    hotel_factor = Decimal("15.0")
                    factor_desc = "Hotel default country multiplier: 15.0 kg/room-night"
                    if "USA" in country or "UNITED STATES" in country:
                        hotel_factor = Decimal("18.5")
                        factor_desc = "EPA Hotel Factor (USA): 18.5 kg CO2e/room-night"
                    elif "UK" in country or "UNITED KINGDOM" in country:
                        hotel_factor = Decimal("12.2")
                        factor_desc = "DEFRA Hotel Factor (UK): 12.2 kg CO2e/room-night"
                        
                    norm_qty = Decimal(nights)
                    norm_unit = "ROOM_NIGHT"
                    co2e_kg = norm_qty * hotel_factor
                    
                elif seg_type == "GROUND_TRANSPORT":
                    act_type = "GROUND_TRANSPORT"
                    v_type = seg.get("vehicle_type", "Gasoline").upper()
                    km_val = float(seg.get("distance_km", 0.0))
                    
                    coef = Decimal("0.18")
                    factor_desc = "Gasoline vehicle standard: 0.18 kg CO2e/km"
                    if "ELECTRIC" in v_type or "EV" in v_type:
                        coef = Decimal("0.05")
                        factor_desc = "Electric Vehicle Grid-mix average: 0.05 kg CO2e/km"
                    elif "DIESEL" in v_type:
                        coef = Decimal("0.17")
                        factor_desc = "Diesel vehicle standard: 0.17 kg CO2e/km"
                        
                    norm_qty = Decimal(str(km_val))
                    norm_unit = "KM"
                    co2e_kg = norm_qty * coef
                    
                status_choice = "FLAGGED" if flagged else "PENDING_REVIEW"
                
                # Check for outliers
                if not flagged and facility:
                    is_outlier, reason = detect_anomaly(facility, act_type, norm_qty, start_date)
                    if is_outlier:
                        status_choice = "FLAGGED"
                        flag_reason = reason
                        
                NormalizedActivity.objects.create(
                    tenant=tenant,
                    raw_record=raw_rec,
                    facility=facility,
                    activity_type=act_type,
                    scope="SCOPE_3",
                    ghg_category=ghg_cat,
                    start_date=start_date,
                    end_date=end_date,
                    raw_quantity=norm_qty,
                    raw_unit=norm_unit,
                    normalized_quantity=norm_qty,
                    normalized_unit=norm_unit,
                    co2e_kg=co2e_kg,
                    emission_factor_used=factor_desc,
                    status=status_choice,
                    flag_reason=flag_reason
                )
                
            raw_rec.status = "NORMALIZED"
            raw_rec.save()
            processed += 1
            
        except Exception as e:
            failed += 1
            logs.append(f"Trip Segment {trip_idx + 1} Error: {str(e)}")
            if 'raw_rec' in locals():
                raw_rec.status = "FAILED"
                raw_rec.error_message = str(e)
                raw_rec.save()
                
    return processed, failed

# Simulated Mock API Payload from corporate travel platform (Concur)
def get_concur_mock_payload():
    return [
        {
            "trip_id": "TRP-99881",
            "employee_email": "saurav@breatheesg.com",
            "booking_date": "2026-05-10",
            "segments": [
                {
                    "segment_id": "SEG-001",
                    "type": "FLIGHT",
                    "origin_airport": "SFO",
                    "destination_airport": "JFK",
                    "cabin_class": "Business"
                },
                {
                    "segment_id": "SEG-002",
                    "type": "HOTEL",
                    "check_in": "2026-05-10",
                    "check_out": "2026-05-14",
                    "room_nights": 4,
                    "city": "New York",
                    "country": "USA"
                },
                {
                    "segment_id": "SEG-003",
                    "type": "GROUND_TRANSPORT",
                    "vehicle_type": "Electric",
                    "distance_km": 82.5
                }
            ]
        },
        {
            "trip_id": "TRP-99882",
            "employee_email": "rahul@breatheesg.com",
            "booking_date": "2026-05-15",
            "segments": [
                {
                    "segment_id": "SEG-004",
                    "type": "FLIGHT",
                    "origin_airport": "LHR",
                    "destination_airport": "CDG",
                    "cabin_class": "Economy"
                },
                {
                    "segment_id": "SEG-005",
                    "type": "HOTEL",
                    "check_in": "2026-05-15",
                    "check_out": "2026-05-17",
                    "room_nights": 2,
                    "city": "Paris",
                    "country": "France"
                }
            ]
        }
    ]
