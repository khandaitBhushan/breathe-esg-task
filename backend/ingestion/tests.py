from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User

from .models import Tenant, Facility, SourceConnection, Airport, NormalizedActivity
from .views import calculate_haversine, run_proration_engine, detect_anomaly

class ESGCalculationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.facility = Facility.objects.create(
            tenant=self.tenant,
            name="San Francisco Office",
            facility_code="FAC-SF-01",
            country="USA",
            region="CAMX"
        )
        self.airport1 = Airport.objects.create(
            iata_code="SFO",
            name="San Francisco Intl",
            city="San Francisco",
            country="USA",
            latitude=37.6190,
            longitude=-122.3750
        )
        self.airport2 = Airport.objects.create(
            iata_code="JFK",
            name="John F Kennedy Intl",
            city="New York",
            country="USA",
            latitude=40.6400,
            longitude=-73.7790
        )

    def test_haversine_distance_calculation(self):
        # SFO to JFK is roughly 4150 km (2580 miles)
        dist = calculate_haversine(
            self.airport1.latitude, self.airport1.longitude,
            self.airport2.latitude, self.airport2.longitude
        )
        # Check that it's between 4100km and 4200km
        self.assertTrue(4100 <= dist <= 4200)

    def test_utility_proration_engine(self):
        # Spans 31 days from Jan 15 to Feb 14
        # 17 days in January, 14 days in February
        start_date = date(2026, 1, 15)
        end_date = date(2026, 2, 14)
        total_kwh = 3100.0
        total_cost = 620.0
        
        shares = run_proration_engine(start_date, end_date, total_kwh, total_cost)
        self.assertEqual(len(shares), 2)
        
        # Verify January share
        jan_share = next(s for s in shares if s["start_date"].month == 1)
        self.assertEqual(jan_share["days"], 17)
        self.assertEqual(jan_share["kwh"], 1700.0)
        self.assertEqual(jan_share["cost"], 340.0)
        
        # Verify February share
        feb_share = next(s for s in shares if s["start_date"].month == 2)
        self.assertEqual(feb_share["days"], 14)
        self.assertEqual(feb_share["kwh"], 1400.0)
        self.assertEqual(feb_share["cost"], 280.0)

    def test_outlier_detection(self):
        # Add 3 months historical standard activities
        for i in range(1, 4):
            NormalizedActivity.objects.create(
                tenant=self.tenant,
                facility=self.facility,
                activity_type="ELECTRICITY",
                scope="SCOPE_2",
                ghg_category="Electricity Usage",
                start_date=date(2026, i, 1),
                end_date=date(2026, i, 28),
                raw_quantity=Decimal("100.0"),
                raw_unit="KWH",
                normalized_quantity=Decimal("100.0"),
                normalized_unit="KWH",
                co2e_kg=Decimal("22.0"),
                emission_factor_used="GridMix",
                status="APPROVED"
            )
            
        # Current quantity 400.0 is 400% of historical average (100.0), triggering anomaly
        current_qty = Decimal("400.0")
        is_outlier, reason = detect_anomaly(
            self.facility, "ELECTRICITY", current_qty, date(2026, 5, 1)
        )
        self.assertTrue(is_outlier)
        self.assertIn("is 400%", reason)
        
        # Current quantity 120.0 is 120% of history (100.0), NOT triggering anomaly
        is_outlier, reason = detect_anomaly(
            self.facility, "ELECTRICITY", Decimal("120.0"), date(2026, 5, 1)
        )
        self.assertFalse(is_outlier)
