import uuid
from django.db import models
from django.contrib.auth.models import User

class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Facility(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="facilities")
    name = models.CharField(max_length=255)
    facility_code = models.CharField(max_length=50) # e.g. WERKS "1000" or PG&E Account "SA-8839211"
    country = models.CharField(max_length=100)
    region = models.CharField(max_length=100) # e.g. CAMX for US grid emissions

    class Meta:
        unique_together = ("tenant", "facility_code")

    def __str__(self):
        return f"{self.name} ({self.facility_code})"

class SourceConnection(models.Model):
    SOURCE_TYPES = [
        ("SAP", "SAP Fuel & Procurement"),
        ("UTILITY", "Utility Electricity Portal"),
        ("TRAVEL", "Corporate Travel API"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="connections")
    name = models.CharField(max_length=255)
    source_type = models.CharField(max_length=50, choices=SOURCE_TYPES)
    connection_details = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.name} ({self.source_type})"

class IngestionJob(models.Model):
    STATUS_CHOICES = [
        ("RUNNING", "Running"),
        ("SUCCESS", "Success"),
        ("PARTIAL_SUCCESS", "Partial Success"),
        ("FAILED", "Failed"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="ingest_jobs")
    source_connection = models.ForeignKey(SourceConnection, on_delete=models.SET_NULL, null=True, related_name="jobs")
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="RUNNING")
    filename = models.CharField(max_length=255, null=True, blank=True)
    file_hash = models.CharField(max_length=64, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    records_processed = models.IntegerField(default=0)
    records_failed = models.IntegerField(default=0)
    logs = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Job {self.id} - {self.status}"

class RawRecord(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("NORMALIZED", "Normalized"),
        ("FAILED", "Failed"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="raw_records")
    ingestion_job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name="raw_records")
    raw_payload = models.JSONField()
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="PENDING")
    error_message = models.TextField(null=True, blank=True)
    ingested_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"RawRecord {self.id} ({self.status})"

class NormalizedActivity(models.Model):
    ACTIVITY_TYPES = [
        ("FUEL", "Fuel Usage"),
        ("PROCUREMENT", "Procurement Spend"),
        ("ELECTRICITY", "Electricity Consumption"),
        ("FLIGHT", "Business Flight"),
        ("HOTEL", "Hotel Stay"),
        ("GROUND_TRANSPORT", "Ground Transport"),
    ]
    SCOPE_CHOICES = [
        ("SCOPE_1", "Scope 1 - Direct"),
        ("SCOPE_2", "Scope 2 - Indirect (Electricity)"),
        ("SCOPE_3", "Scope 3 - Value Chain"),
    ]
    STATUS_CHOICES = [
        ("PENDING_REVIEW", "Pending Review"),
        ("APPROVED", "Approved"),
        ("FLAGGED", "Flagged Anomaly"),
        ("REJECTED", "Rejected"),
        ("AUDIT_LOCKED", "Audit Locked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="normalized_activities")
    raw_record = models.ForeignKey(RawRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name="normalized_activities")
    facility = models.ForeignKey(Facility, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    
    activity_type = models.CharField(max_length=50, choices=ACTIVITY_TYPES)
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    ghg_category = models.CharField(max_length=255) # e.g. "Stationary Combustion", "Category 6: Business Travel"
    
    start_date = models.DateField()
    end_date = models.DateField()
    
    raw_quantity = models.DecimalField(max_digits=18, decimal_places=4)
    raw_unit = models.CharField(max_length=50)
    
    normalized_quantity = models.DecimalField(max_digits=18, decimal_places=4)
    normalized_unit = models.CharField(max_length=50)
    
    co2e_kg = models.DecimalField(max_digits=18, decimal_places=4)
    emission_factor_used = models.CharField(max_length=255)
    
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="PENDING_REVIEW")
    flag_reason = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.activity_type} - {self.co2e_kg} kg CO2e ({self.status})"

class AuditTrail(models.Model):
    ACTION_CHOICES = [
        ("CREATE", "Created"),
        ("UPDATE", "Updated"),
        ("APPROVE", "Approved"),
        ("FLAG", "Flagged"),
        ("REJECT", "Rejected"),
        ("LOCK", "Locked for Audit"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    normalized_activity = models.ForeignKey(NormalizedActivity, on_delete=models.CASCADE, related_name="audit_trail")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    field_name = models.CharField(max_length=100, null=True, blank=True)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    comment = models.TextField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} on {self.normalized_activity.id} at {self.timestamp}"

class Airport(models.Model):
    iata_code = models.CharField(max_length=3, primary_key=True)
    name = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    country = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    def __str__(self):
        return f"{self.iata_code} - {self.name}"
