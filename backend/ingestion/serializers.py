from rest_framework import serializers
from django.contrib.auth.models import User
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

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = "__all__"

class FacilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Facility
        fields = "__all__"

class SourceConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourceConnection
        fields = "__all__"

class IngestionJobSerializer(serializers.ModelSerializer):
    source_connection_name = serializers.ReadOnlyField(source="source_connection.name")
    source_type = serializers.ReadOnlyField(source="source_connection.source_type")
    
    class Meta:
        model = IngestionJob
        fields = "__all__"

class RawRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawRecord
        fields = "__all__"

class AuditTrailSerializer(serializers.ModelSerializer):
    user_detail = UserSerializer(source="user", read_only=True)
    
    class Meta:
        model = AuditTrail
        fields = "__all__"

class AirportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Airport
        fields = "__all__"

class NormalizedActivitySerializer(serializers.ModelSerializer):
    facility_detail = FacilitySerializer(source="facility", read_only=True)
    raw_payload = serializers.ReadOnlyField(source="raw_record.raw_payload")
    audit_trail = AuditTrailSerializer(many=True, read_only=True)
    
    class Meta:
        model = NormalizedActivity
        fields = "__all__"
