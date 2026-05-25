from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from ingestion.models import Tenant, Facility, SourceConnection, Airport

class Command(BaseCommand):
    help = "Seed Breathe ESG database with default tenants, facilities, source connections, and airport coordinates"

    def handle(self, *args, **options):
        self.stdout.write("Seeding database...")
        
        # 1. Create Default Superuser
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@breatheesg.com", "password")
            self.stdout.write(self.style.SUCCESS("Created superuser 'admin' (password: password)"))
            
        # 2. Create Default Tenant
        tenant, t_created = Tenant.objects.get_or_create(
            name="Breathe ESG Corporate Enterprise"
        )
        if t_created:
            self.stdout.write(self.style.SUCCESS(f"Created Tenant: {tenant.name}"))
            
        # 3. Create Default Facilities matching SAP & Utility codes
        facilities_data = [
            {"name": "Munich Head Plant", "code": "1000", "country": "Germany", "region": "Europe"},
            {"name": "Silicon Valley Hub", "code": "2000", "country": "USA", "region": "CAMX"},
            {"name": "New York Distribution Center", "code": "SA-8839211", "country": "USA", "region": "NYUP"},
            {"name": "London Sales Office", "code": "SA-1122334", "country": "UK", "region": "UK-Grid"},
        ]
        
        for fdata in facilities_data:
            fac, f_created = Facility.objects.get_or_create(
                tenant=tenant,
                facility_code=fdata["code"],
                defaults={
                    "name": fdata["name"],
                    "country": fdata["country"],
                    "region": fdata["region"]
                }
            )
            if f_created:
                self.stdout.write(f"Created Facility: {fac.name} (Code: {fac.facility_code})")
                
        # 4. Create Source Connections
        connections = [
            {"name": "SAP Material Document SFTP Export", "type": "SAP"},
            {"name": "PG&E & Con Edison Portal Scrapes", "type": "UTILITY"},
            {"name": "Corporate Travel Concur API Integration", "type": "TRAVEL"}
        ]
        
        for cdata in connections:
            conn, c_created = SourceConnection.objects.get_or_create(
                tenant=tenant,
                source_type=cdata["type"],
                defaults={"name": cdata["name"]}
            )
            if c_created:
                self.stdout.write(f"Created Source Connection: {conn.name}")
                
        # 5. Pre-seed Airports coordinates for Flight distance solver
        airports = [
            {"code": "SFO", "name": "San Francisco International Airport", "city": "San Francisco", "country": "USA", "lat": 37.619, "lon": -122.375},
            {"code": "JFK", "name": "John F. Kennedy International Airport", "city": "New York", "country": "USA", "lat": 40.640, "lon": -73.779},
            {"code": "LHR", "name": "London Heathrow Airport", "city": "London", "country": "UK", "lat": 51.470, "lon": -0.454},
            {"code": "CDG", "name": "Charles de Gaulle Airport", "city": "Paris", "country": "France", "lat": 49.010, "lon": 2.550},
            {"code": "BLR", "name": "Kempegowda International Airport", "city": "Bangalore", "country": "India", "lat": 13.199, "lon": 77.707},
            {"code": "DXB", "name": "Dubai International Airport", "city": "Dubai", "country": "UAE", "lat": 25.253, "lon": 55.364},
            {"code": "HND", "name": "Haneda Airport", "city": "Tokyo", "country": "Japan", "lat": 35.549, "lon": 139.780},
        ]
        
        for ap in airports:
            port, ap_created = Airport.objects.get_or_create(
                iata_code=ap["code"],
                defaults={
                    "name": ap["name"],
                    "city": ap["city"],
                    "country": ap["country"],
                    "latitude": ap["lat"],
                    "longitude": ap["lon"]
                }
            )
            if ap_created:
                self.stdout.write(f"Seeded Airport: {port.iata_code} ({port.city})")
                
        self.stdout.write(self.style.SUCCESS("Database seeding completed successfully!"))
        
