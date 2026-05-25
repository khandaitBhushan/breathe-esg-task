from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("ingestion.urls")),
    # Serve built assets manually for unified production Docker setups
    path("assets/<path:path>", serve, {
        "document_root": settings.STATICFILES_DIRS[0]
    }),
    # Unified Frontend Catch-All
    path("", TemplateView.as_view(template_name="index.html"), name="index"),
]
