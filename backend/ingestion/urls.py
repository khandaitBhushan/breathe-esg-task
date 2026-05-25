from django.urls import path
from . import views

urlpatterns = [
    path("tenant/", views.get_tenant_info, name="tenant-info"),
    path("facilities/", views.facility_list, name="facility-list"),
    path("connections/", views.connection_list, name="connection-list"),
    path("jobs/", views.job_list, name="job-list"),
    path("records/", views.record_list, name="record-list"),
    path("records/<uuid:pk>/approve/", views.approve_record, name="approve-record"),
    path("records/<uuid:pk>/edit/", views.edit_record, name="edit-record"),
    path("records/lock/", views.lock_records, name="lock-records"),
    path("records/<uuid:pk>/reject/", views.reject_record, name="reject-record"),
    path("stats/", views.get_dashboard_stats, name="dashboard-stats"),
    path("ingest/", views.ingest_data, name="ingest-data"),
]
