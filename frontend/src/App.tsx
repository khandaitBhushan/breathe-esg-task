import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  UploadCloud, 
  FileSpreadsheet, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Lock, 
  FileCode2, 
  Search, 
  Filter, 
  Settings, 
  Activity, 
  Download, 
  Sparkles, 
  Plus, 
  Edit3, 
  History 
} from 'lucide-react';
import { 
  NormalizedActivity, 
  DashboardStats, 
  IngestionJob, 
  Facility, 
  SourceConnection 
} from './types';

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port === '3000') 
  ? 'http://127.0.0.1:8000' 
  : '';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ingest' | 'ledger' | 'jobs'>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [records, setRecords] = useState<NormalizedActivity[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [connections, setConnections] = useState<SourceConnection[]>([]);
  
  // Filtering states
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activityFilter, setActivityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Loader & Error states
  const [loading, setLoading] = useState<boolean>(true);
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selection & Details Drawer states
  const [selectedRecord, setSelectedRecord] = useState<NormalizedActivity | null>(null);
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  
  // Inline edit states in drawer
  const [editMode, setEditMode] = useState<boolean>(false);
  const [editQty, setEditQty] = useState<string>('');
  const [editCo2e, setEditCo2e] = useState<string>('');
  const [editStart, setEditStart] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editComment, setEditComment] = useState<string>('');
  
  // Form for creating new facilities
  const [showAddFacility, setShowAddFacility] = useState<boolean>(false);
  const [facName, setFacName] = useState<string>('');
  const [facCode, setFacCode] = useState<string>('');
  const [facCountry, setFacCountry] = useState<string>('');
  const [facRegion, setFacRegion] = useState<string>('');

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'X-Tenant-ID': '' }; // Multi-tenant header
      
      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/api/stats/`, { headers });
      const statsData = await statsRes.json();
      setStats(statsData);
      
      // Fetch records
      const recordsRes = await fetch(`${API_BASE}/api/records/`, { headers });
      const recordsData = await recordsRes.json();
      setRecords(recordsData);
      
      // Fetch jobs
      const jobsRes = await fetch(`${API_BASE}/api/jobs/`, { headers });
      const jobsData = await jobsRes.json();
      setJobs(jobsData);
      
      // Fetch facilities
      const facRes = await fetch(`${API_BASE}/api/facilities/`, { headers });
      const facData = await facRes.json();
      setFacilities(facData);

      // Fetch connections
      const connRes = await fetch(`${API_BASE}/api/connections/`, { headers });
      const connData = await connRes.json();
      setConnections(connData);
      
    } catch (err: any) {
      console.error(err);
      setError('Failed to connect to the Django backend. Please ensure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch ledger when records change or filters are set
  const reloadLedger = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/records/`);
      const data = await res.json();
      setRecords(data);
      
      const statsRes = await fetch(`${API_BASE}/api/stats/`);
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to reload ledger', err);
    }
  };

  // Handle ingestion file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, sourceType: 'SAP' | 'UTILITY') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIngesting(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('source_type', sourceType);
    
    try {
      const res = await fetch(`${API_BASE}/api/ingest/`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        throw new Error('Upload process failed.');
      }
      
      await fetchInitialData();
      setActiveTab('jobs'); // Navigate to jobs tab to see logs
      
    } catch (err: any) {
      setError(err.message || 'Error occurred during ingestion');
    } finally {
      setIngesting(false);
    }
  };

  // Trigger Concur Travel API Ingestion Simulation
  const triggerTravelApiPull = async () => {
    setIngesting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/ingest/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: 'TRAVEL' })
      });
      
      if (!res.ok) throw new Error('API Pull failed');
      
      await fetchInitialData();
      setActiveTab('jobs');
    } catch (err: any) {
      setError(err.message || 'Error pulling Concur API logs');
    } finally {
      setIngesting(false);
    }
  };

  // Quick Approve Record
  const handleApprove = async (id: string, comment = 'Approved by analyst') => {
    try {
      const res = await fetch(`${API_BASE}/api/records/${id}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });
      
      if (res.ok) {
        const updated = await res.json();
        // Update local list
        setRecords(records.map(r => r.id === id ? updated : r));
        if (selectedRecord && selectedRecord.id === id) {
          setSelectedRecord(updated);
        }
        reloadLedger();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Quick Reject Record
  const handleReject = async (id: string, comment = 'Rejected by analyst') => {
    try {
      const res = await fetch(`${API_BASE}/api/records/${id}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });
      
      if (res.ok) {
        const updated = await res.json();
        setRecords(records.map(r => r.id === id ? updated : r));
        if (selectedRecord && selectedRecord.id === id) {
          setSelectedRecord(updated);
        }
        reloadLedger();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Edit record fields
  const handleSaveEdit = async () => {
    if (!selectedRecord) return;
    try {
      const res = await fetch(`${API_BASE}/api/records/${selectedRecord.id}/edit/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalized_quantity: editQty,
          co2e_kg: editCo2e,
          start_date: editStart,
          end_date: editEnd,
          comment: editComment || 'Operational adjustment.'
        })
      });
      
      if (res.ok) {
        const updated = await res.json();
        setRecords(records.map(r => r.id === selectedRecord.id ? updated : r));
        setSelectedRecord(updated);
        setEditMode(false);
        setEditComment('');
        reloadLedger();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk lock approved records
  const handleBulkLock = async () => {
    if (bulkSelection.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/records/lock/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_ids: bulkSelection })
      });
      
      if (res.ok) {
        setBulkSelection([]);
        reloadLedger();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create new Facility
  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facName || !facCode || !facCountry || !facRegion) return;
    try {
      const res = await fetch(`${API_BASE}/api/facilities/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: facName,
          facility_code: facCode,
          country: facCountry,
          region: facRegion
        })
      });
      if (res.ok) {
        const newFac = await res.json();
        setFacilities([...facilities, newFac]);
        setFacName('');
        setFacCode('');
        setFacCountry('');
        setFacRegion('');
        setShowAddFacility(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Download Mock CSV files direct from Browser JS strings
  const downloadSampleFile = (type: 'SAP' | 'UTILITY') => {
    let content = '';
    let filename = '';
    
    if (type === 'SAP') {
      filename = 'mock_sap_mb51_export.csv';
      content = `MANDT,BUKRS,WERKS,MATNR,MAKTX,MENGE,MEINS,WRBTR,WAERS,BUDAT,SHKZG\n100,US01,1000,MAT-D-01,DIESEL STATIONARY FUEL,500.0,L,1200.00,USD,20260510,S\n100,US01,1000,MAT-H-02,HEATING OIL FACILITY,80.0,GAL,450.00,USD,20260511,S\n100,US01,2000,MAT-O-09,OFFICE NOTEBOOKS,25.0,PC,1800.00,USD,20260512,S\n100,US01,1000,MAT-D-01,DIESEL FUEL RETURNED,-50.0,L,-120.00,USD,20260514,H\n100,US01,2000,MAT-D-01,DIESEL FUEL OUTLIER,50000.0,L,120000.00,USD,20260515,S\n`;
    } else {
      filename = 'mock_utility_billing.csv';
      content = `ServiceAgreementID,MeterNumber,BillingStartDate,BillingEndDate,UsageKWh,DemandKW,TariffCode,TotalAmountPaid\nSA-8839211,MTR-552,2026-04-15,2026-05-14,3100.0,24.5,E-19,750.00\nSA-1122334,MTR-668,2026-04-01,2026-04-30,5500.0,42.0,TOU-8,1250.00\nSA-8839211,MTR-552,2026-04-20,2026-05-20,4000.0,30.0,E-19,920.00\n`;
    }
    
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Record Filter conditions
  const filteredRecords = records.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (activityFilter !== 'ALL' && r.activity_type !== activityFilter) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const cat = r.ghg_category.toLowerCase();
      const fac = r.facility_detail?.name.toLowerCase() || '';
      const code = r.facility_detail?.facility_code.toLowerCase() || '';
      return cat.includes(q) || fac.includes(q) || code.includes(q);
    }
    return true;
  });

  return (
    <div>
      {/* App Bar Top */}
      <header className="app-header">
        <div className="header-container">
          <div className="logo-section">
            <span>🍃</span>
            <div>
              <h1>Breathe ESG Ingestion Engine</h1>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Audit-Grade Reporting Dashboard</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span className="tenant-pill">
              🔒 Tenant: Breathe ESG Corporate Enterprise
            </span>
            
            <nav className="nav-tabs">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              >
                <BarChart3 size={16} /> Analytics
              </button>
              <button 
                onClick={() => setActiveTab('ingest')} 
                className={`tab-btn ${activeTab === 'ingest' ? 'active' : ''}`}
              >
                <UploadCloud size={16} /> Ingest Streams
              </button>
              <button 
                onClick={() => setActiveTab('ledger')} 
                className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
              >
                <Activity size={16} /> Review Ledger
              </button>
              <button 
                onClick={() => setActiveTab('jobs')} 
                className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`}
              >
                <FileCode2 size={16} /> Pipelines Log
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="app-container">
        
        {/* Error Alert Bar */}
        {error && (
          <div className="glass-panel" style={{ borderColor: 'var(--color-danger)', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)' }}>
            <AlertTriangle color="var(--color-danger)" />
            <div>
              <h4 style={{ color: 'var(--color-danger)' }}>Backend Sync Issue</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{error}</p>
            </div>
            <button className="btn secondary" style={{ marginLeft: 'auto', padding: '6px 12px' }} onClick={fetchInitialData}>
              Retry Connection
            </button>
          </div>
        )}

        {/* Global Loading Spinner */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(16, 185, 129, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-family-title)' }}>Synchronizing Database Records...</p>
          </div>
        )}

        {/* TABS VIEW SWITCH */}
        {!loading && (
          <>
            {/* 1. ANALYTICS DASHBOARD VIEW */}
            {activeTab === 'dashboard' && stats && (
              <div>
                {/* Stats Ledger Row */}
                <div className="stats-grid">
                  <div className="glass-panel hoverable widget-card">
                    <div className="widget-icon primary">💨</div>
                    <div className="widget-info">
                      <h3>Total Normalized Carbon</h3>
                      <div className="value">
                        {((stats.total_co2e_kg) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="unit">t CO2e</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-panel hoverable widget-card">
                    <div className="widget-icon secondary">🔥</div>
                    <div className="widget-info">
                      <h3>Scope 1 (Fuel Combustion)</h3>
                      <div className="value">
                        {((stats.scopes.scope1) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="unit">t CO2e</span>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel hoverable widget-card">
                    <div className="widget-icon warning">⚡</div>
                    <div className="widget-info">
                      <h3>Scope 2 (Electricity Grid)</h3>
                      <div className="value">
                        {((stats.scopes.scope2) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="unit">t CO2e</span>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel hoverable widget-card">
                    <div className="widget-icon primary" style={{ color: 'var(--color-neutral)', borderColor: 'rgba(139, 92, 246, 0.2)', background: 'rgba(139, 92, 246, 0.1)' }}>✈️</div>
                    <div className="widget-info">
                      <h3>Scope 3 (Value Chain / Travel)</h3>
                      <div className="value">
                        {((stats.scopes.scope3) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="unit">t CO2e</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid charts and maps */}
                <div className="two-col-grid">
                  {/* Scope Shares Stacked Bar chart using interactive SVGs */}
                  <div className="glass-panel">
                    <div className="chart-header">
                      <h2>Emissions Distribution by Category</h2>
                      <div className="chart-legend">
                        <div className="legend-item"><span className="legend-color" style={{ background: 'var(--color-primary)' }} /> Scope 1</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: 'var(--color-warning)' }} /> Scope 2</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: 'var(--color-neutral)' }} /> Scope 3</div>
                      </div>
                    </div>
                    
                    <div className="chart-container">
                      <div style={{ display: 'flex', height: '220px', alignItems: 'flex-end', gap: '32px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
                        {stats.categories.map((cat, idx) => {
                          const maxCo2 = Math.max(...stats.categories.map(c => c.co2e_kg), 1);
                          const pct = (cat.co2e_kg / maxCo2) * 100;
                          
                          // Categorize scope based on category name
                          let barColor = 'var(--color-neutral)';
                          if (cat.name.includes('Scope 2')) barColor = 'var(--color-warning)';
                          if (cat.name.includes('Combustion')) barColor = 'var(--color-primary)';
                          
                          return (
                            <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                {(cat.co2e_kg / 1000).toFixed(1)}t
                              </div>
                              <div style={{ 
                                width: '32px', 
                                height: `${pct}%`, 
                                background: barColor, 
                                borderRadius: '4px 4px 0 0',
                                boxShadow: `0 0 10px ${barColor}33`,
                                transition: 'height 0.3s ease'
                              }} />
                              <div style={{ 
                                fontSize: '9px', 
                                color: 'var(--text-muted)', 
                                marginTop: '12px', 
                                textAlign: 'center', 
                                height: '24px', 
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                width: '70px'
                              }} title={cat.name}>
                                {cat.name}
                              </div>
                            </div>
                          );
                        })}
                        {stats.categories.length === 0 && (
                          <div style={{ flex: 1, textAlign: 'center', color: 'var(--text-muted)', paddingBottom: '60px' }}>
                            No carbon records active. Upload data to view categorization.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Facility Carbon Breakdown Interactive SVG list */}
                  <div className="glass-panel">
                    <div className="chart-header">
                      <h2>Auditable Facility Allocations</h2>
                      <button className="btn secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowAddFacility(true)}>
                        <Plus size={14} /> Add Facility
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '240px', overflowY: 'auto' }}>
                      {stats.facilities.map((fac, idx) => {
                        const total = stats.total_co2e_kg || 1;
                        const pct = (fac.co2e_kg / total) * 100;
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ fontWeight: '500' }}>{fac.name} ({fac.code})</span>
                              <span style={{ color: 'var(--color-primary)', fontWeight: '600' }}>
                                {(fac.co2e_kg / 1000).toFixed(2)} t CO2e
                              </span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', borderRadius: '9999px' }} />
                            </div>
                          </div>
                        );
                      })}
                      {stats.facilities.length === 0 && (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                          No facilities registered. Set up mapping parameters.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quality ledger block */}
                <div className="glass-panel" style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3>Assurance & Validation Ledger Health</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Quality states of all calculated activity lines in database</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-primary)' }}>
                        {stats.quality.total > 0 ? Math.round(((stats.quality.approved + stats.quality.audit_locked) / stats.quality.total) * 100) : 0}%
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Locked & Approved Ratio</div>
                    </div>
                  </div>

                  <div className="health-meter">
                    <div className="meter-segment approved" style={{ width: `${(stats.quality.approved / (stats.quality.total || 1)) * 100}%` }} title="Approved" />
                    <div className="meter-segment approved" style={{ width: `${(stats.quality.audit_locked / (stats.quality.total || 1)) * 100}%`, filter: 'brightness(1.3)' }} title="Audit Locked" />
                    <div className="meter-segment flagged" style={{ width: `${(stats.quality.flagged / (stats.quality.total || 1)) * 100}%` }} title="Flagged Anomalies" />
                    <div className="meter-segment pending" style={{ width: `${(stats.quality.pending_review / (stats.quality.total || 1)) * 100}%` }} title="Pending Analyst Review" />
                    <div className="meter-segment rejected" style={{ width: `${(stats.quality.rejected / (stats.quality.total || 1)) * 100}%` }} title="Rejected Lines" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginTop: '16px', fontSize: '12px', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Approved</div>
                      <strong style={{ fontSize: '16px', color: 'var(--color-primary)' }}>{stats.quality.approved}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Audit Locked</div>
                      <strong style={{ fontSize: '16px', color: 'var(--color-neutral)' }}>{stats.quality.audit_locked}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Pending Analyst</div>
                      <strong style={{ fontSize: '16px', color: 'var(--color-secondary)' }}>{stats.quality.pending_review}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Flagged Warning</div>
                      <strong style={{ fontSize: '16px', color: 'var(--color-warning)' }}>{stats.quality.flagged}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Rejected</div>
                      <strong style={{ fontSize: '16px', color: 'var(--color-danger)' }}>{stats.quality.rejected}</strong>
                    </div>
                  </div>
                </div>

                {/* Facility Creation Modal backdrop */}
                {showAddFacility && (
                  <div className="drawer-backdrop" onClick={() => setShowAddFacility(false)}>
                    <div className="drawer-panel" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
                      <div className="drawer-header">
                        <h3>Register Facility Unit</h3>
                        <button className="btn secondary" style={{ padding: '6px' }} onClick={() => setShowAddFacility(false)}>✖</button>
                      </div>
                      <form onSubmit={handleCreateFacility}>
                        <div className="drawer-content">
                          <div className="form-group">
                            <label>Facility Name</label>
                            <input className="form-control" type="text" placeholder="e.g. New York Logistics Center" value={facName} onChange={e => setFacName(e.target.value)} required />
                          </div>
                          <div className="form-group">
                            <label>Facility Code (Maps to SAP Plant WERKS / Utility Meter)</label>
                            <input className="form-control" type="text" placeholder="e.g. 1000 or SA-8839211" value={facCode} onChange={e => setFacCode(e.target.value)} required />
                          </div>
                          <div className="form-group">
                            <label>Country</label>
                            <input className="form-control" type="text" placeholder="e.g. USA" value={facCountry} onChange={e => setFacCountry(e.target.value)} required />
                          </div>
                          <div className="form-group">
                            <label>Grid Mix Subregion / State</label>
                            <input className="form-control" type="text" placeholder="e.g. CAMX or NYUP" value={facRegion} onChange={e => setFacRegion(e.target.value)} required />
                          </div>
                        </div>
                        <div className="drawer-footer">
                          <button className="btn secondary" type="button" onClick={() => setShowAddFacility(false)}>Cancel</button>
                          <button className="btn" type="submit">Save Facility</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. DATA INGESTION VIEW */}
            {activeTab === 'ingest' && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2>Data Ingestion Hub</h2>
                  <p style={{ color: 'var(--text-muted)' }}>Configure connection streams or drag-and-drop client export files to run calculations.</p>
                </div>

                <div className="ingest-grid">
                  {/* SAP STREAM CARD */}
                  <div className="glass-panel">
                    <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span className="source-badge sap">SAP Export Stream</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>MB51 flat CSV file</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      Ingests material ledger entries. Standardizes fuel volumes to Liters (Scope 1) and procurement totals to spend carbon (Scope 3). Evaluates Debit/Credit indicators.
                    </p>

                    <div className="drag-drop-area">
                      <FileSpreadsheet className="upload-icon" />
                      <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                        Drag SAP CSV report here
                      </p>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>or click to browse local files</span>
                      <input 
                        type="file" 
                        accept=".csv" 
                        disabled={ingesting} 
                        onChange={(e) => handleFileUpload(e, 'SAP')} 
                      />
                    </div>
                    
                    <button 
                      className="btn secondary" 
                      style={{ width: '100%', justifyContent: 'center' }} 
                      onClick={() => downloadSampleFile('SAP')}
                    >
                      <Download size={14} /> Download Sample SAP CSV
                    </button>
                  </div>

                  {/* UTILITY BILLS CARD */}
                  <div className="glass-panel">
                    <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span className="source-badge utility">Utility Electricity</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Portal CSV Upload</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      Ingests commercial meter readings, links accounts to facilities, resolves regional grid mix factors, and splits cross-month billing cycles via day-interval proration.
                    </p>

                    <div className="drag-drop-area">
                      <FileSpreadsheet className="upload-icon" />
                      <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                        Drag PG&E Portal CSV here
                      </p>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>or click to browse local files</span>
                      <input 
                        type="file" 
                        accept=".csv" 
                        disabled={ingesting} 
                        onChange={(e) => handleFileUpload(e, 'UTILITY')} 
                      />
                    </div>

                    <button 
                      className="btn secondary" 
                      style={{ width: '100%', justifyContent: 'center' }} 
                      onClick={() => downloadSampleFile('UTILITY')}
                    >
                      <Download size={14} /> Download Sample Utility CSV
                    </button>
                  </div>

                  {/* CORPORATE TRAVEL API CARD */}
                  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span className="source-badge travel">Corporate Travel API</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-primary)' }}>API Active Connection</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      Pulls flight segments, hotel stays, and rental car miles directly from corporate booking systems (Concur). Performs Great-Circle distance math using IATA codes.
                    </p>

                    <div style={{ border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', fontSize: '12px', flex: 1, marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>Endpoint Status:</span>
                        <strong style={{ color: 'var(--color-primary)' }}>READY (SIMULATED)</strong>
                      </div>
                      <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>Connection Method:</span>
                        <span>HTTP REST GET Payload</span>
                      </div>
                      <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between' }}>
                        <span>Source System:</span>
                        <span>SAP Concur v4 Integration</span>
                      </div>
                    </div>

                    <button 
                      className="btn" 
                      style={{ width: '100%', justifyContent: 'center' }} 
                      onClick={triggerTravelApiPull}
                      disabled={ingesting}
                    >
                      <Sparkles size={16} /> Ingest From Corporate Concur Feed
                    </button>
                  </div>
                </div>

                {ingesting && (
                  <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(6, 182, 212, 0.05)', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.2)', textAlign: 'center' }}>
                    <div style={{ width: '20px', height: '20px', border: '2px solid rgba(6, 182, 212, 0.2)', borderTopColor: 'var(--color-secondary)', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '12px', verticalAlign: 'middle' }} />
                    <span style={{ fontSize: '14px', color: 'var(--color-secondary)' }}>Parsing original headers, performing unit scale corrections and mapping audit trails...</span>
                  </div>
                )}
              </div>
            )}

            {/* 3. REVIEW LEDGER GRID VIEW */}
            {activeTab === 'ledger' && (
              <div>
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2>Review Ledger & Verification Console</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Analysts can drill down into original payloads, modify values with audit comments, and sign off.</p>
                  </div>
                  
                  {bulkSelection.length > 0 && (
                    <button className="btn warning" onClick={handleBulkLock}>
                      <Lock size={14} /> Lock {bulkSelection.length} Row(s) for Audit
                    </button>
                  )}
                </div>

                {/* Filters Console Bar */}
                <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                    <Search size={16} color="var(--text-muted)" />
                    <input 
                      className="form-control" 
                      type="text" 
                      placeholder="Search category, facility..." 
                      style={{ border: 'none', background: 'transparent', padding: '4px' }}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Filter size={14} color="var(--text-muted)" />
                      <select 
                        className="form-control" 
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                      >
                        <option value="ALL">All Validation States</option>
                        <option value="PENDING_REVIEW">Pending Review</option>
                        <option value="FLAGGED">Flagged Warnings</option>
                        <option value="APPROVED">Approved Rows</option>
                        <option value="REJECTED">Rejected Rows</option>
                        <option value="AUDIT_LOCKED">Locked for Audit</option>
                      </select>
                    </div>

                    <select 
                      className="form-control" 
                      style={{ padding: '6px 12px', fontSize: '13px' }}
                      value={activityFilter}
                      onChange={e => setActivityFilter(e.target.value)}
                    >
                      <option value="ALL">All Activity Types</option>
                      <option value="FUEL">Fuel Usage</option>
                      <option value="PROCUREMENT">Procurement Spend</option>
                      <option value="ELECTRICITY">Electricity</option>
                      <option value="FLIGHT">Flights</option>
                      <option value="HOTEL">Hotels</option>
                      <option value="GROUND_TRANSPORT">Ground Transport</option>
                    </select>
                  </div>
                </div>

                {/* LEDGER TABULAR CONTAINER */}
                <div className="records-table-container">
                  <table className="records-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', padding: '16px 20px' }}>
                          <input 
                            type="checkbox" 
                            checked={bulkSelection.length > 0 && bulkSelection.length === filteredRecords.filter(r => r.status === 'APPROVED').length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkSelection(filteredRecords.filter(r => r.status === 'APPROVED').map(r => r.id));
                              } else {
                                setBulkSelection([]);
                              }
                            }}
                          />
                        </th>
                        <th>Activity Details</th>
                        <th>Facility</th>
                        <th>Scope</th>
                        <th>Normalized Quantity</th>
                        <th>CO2 Equivalent</th>
                        <th>Validation State</th>
                        <th style={{ textAlign: 'right' }}>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((record) => {
                        const isChecked = bulkSelection.includes(record.id);
                        return (
                          <tr key={record.id} style={{ cursor: 'pointer' }} onClick={() => {
                            setSelectedRecord(record);
                            setEditQty(record.normalized_quantity);
                            setEditCo2e(record.co2e_kg);
                            setEditStart(record.start_date);
                            setEditEnd(record.end_date);
                            setEditMode(false);
                          }}>
                            <td onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                disabled={record.status !== 'APPROVED'}
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBulkSelection([...bulkSelection, record.id]);
                                  } else {
                                    setBulkSelection(bulkSelection.filter(id => id !== record.id));
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: '600' }}>{record.ghg_category}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Period: {record.start_date} to {record.end_date}
                              </div>
                            </td>
                            <td>
                              {record.facility_detail ? (
                                <div>
                                  <div style={{ fontWeight: '500' }}>{record.facility_detail.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                    Code: {record.facility_detail.facility_code}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--color-danger)', fontSize: '12px' }}>Unresolved Lookup</span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: record.scope === 'SCOPE_1' ? 'var(--color-primary)' : record.scope === 'SCOPE_2' ? 'var(--color-warning)' : 'var(--color-neutral)' }}>
                                {record.scope.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <div>
                                {parseFloat(record.normalized_quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{record.normalized_unit}</span>
                              </div>
                              {record.raw_unit !== record.normalized_unit && (
                                <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                                  Parsed from {parseFloat(record.raw_quantity).toFixed(0)} {record.raw_unit}
                                </div>
                              )}
                            </td>
                            <td>
                              <strong style={{ color: 'var(--color-primary)' }}>
                                {(parseFloat(record.co2e_kg) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} t CO2e
                              </strong>
                            </td>
                            <td>
                              <span className={`status-badge ${record.status.toLowerCase()}`}>
                                {record.status.replace('_', ' ')}
                              </span>
                              {record.flag_reason && (
                                <div style={{ fontSize: '10px', color: 'var(--color-warning)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.flag_reason}>
                                  ⚠ {record.flag_reason}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                {record.status !== 'AUDIT_LOCKED' && record.status !== 'APPROVED' && (
                                  <button className="btn" style={{ padding: '6px 10px', fontSize: '11px', boxShadow: 'none' }} onClick={() => handleApprove(record.id)}>
                                    Approve
                                  </button>
                                )}
                                {record.status === 'APPROVED' && (
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={14} color="var(--color-primary)" /> Approved
                                  </span>
                                )}
                                {record.status === 'AUDIT_LOCKED' && (
                                  <span style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Lock size={14} /> Locked
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                            No normalized activities match selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* DETAILS DRILL-DOWN PANEL SLIDEOUT DRAWER */}
                {selectedRecord && (
                  <div className="drawer-backdrop" onClick={() => setSelectedRecord(null)}>
                    <div className="drawer-panel" onClick={e => e.stopPropagation()}>
                      <div className="drawer-header">
                        <div>
                          <span className={`source-badge ${selectedRecord.raw_record ? 'sap' : 'travel'}`} style={{ marginBottom: '6px', display: 'inline-block' }}>
                            Activity ID: {selectedRecord.id.substring(0, 8)}
                          </span>
                          <h3>{selectedRecord.ghg_category}</h3>
                        </div>
                        <button className="btn secondary" style={{ padding: '6px 12px' }} onClick={() => setSelectedRecord(null)}>
                          ✖ Close
                        </button>
                      </div>

                      <div className="drawer-content">
                        {/* Summary Details */}
                        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', marginBottom: '24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                            <div>
                              <div style={{ color: 'var(--text-muted)' }}>Facility:</div>
                              <strong>{selectedRecord.facility_detail?.name || 'Unresolved mapping'}</strong>
                            </div>
                            <div>
                              <div style={{ color: 'var(--text-muted)' }}>Calculated Scope:</div>
                              <strong style={{ color: 'var(--color-primary)' }}>{selectedRecord.scope.replace('_', ' ')}</strong>
                            </div>
                            <div>
                              <div style={{ color: 'var(--text-muted)' }}>Normalized Quantity:</div>
                              <strong>{parseFloat(selectedRecord.normalized_quantity).toFixed(2)} {selectedRecord.normalized_unit}</strong>
                            </div>
                            <div>
                              <div style={{ color: 'var(--text-muted)' }}>Emissions Impact:</div>
                              <strong style={{ color: 'var(--color-primary)' }}>{parseFloat(selectedRecord.co2e_kg).toFixed(2)} kg CO2e</strong>
                            </div>
                          </div>
                        </div>

                        {/* ANOMALY BOX */}
                        {selectedRecord.flag_reason && (
                          <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '14px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                            <AlertTriangle color="var(--color-warning)" style={{ flexShrink: 0 }} />
                            <div>
                              <h5 style={{ color: 'var(--color-warning)', fontWeight: '600' }}>Assurance Anomaly Flag</h5>
                              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{selectedRecord.flag_reason}</p>
                            </div>
                          </div>
                        )}

                        {/* LINEAGE RAW DATA (Drill down) */}
                        <div style={{ marginBottom: '24px' }}>
                          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                            <FileCode2 size={16} /> Original Source Payload Lineage
                          </h4>
                          {selectedRecord.raw_payload ? (
                            <pre className="code-block">{JSON.stringify(selectedRecord.raw_payload, null, 2)}</pre>
                          ) : (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No source record log. Manually created activity.</p>
                          )}
                        </div>

                        {/* AUDIT TIMELINE HISTORY */}
                        <div style={{ marginBottom: '24px' }}>
                          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '12px' }}>
                            <History size={16} /> Audit Trail & Adjustments History
                          </h4>
                          
                          <div style={{ borderLeft: '2px solid rgba(255,255,255,0.06)', paddingLeft: '20px', marginLeft: '8px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {selectedRecord.audit_trail && selectedRecord.audit_trail.map((trail, tIdx) => (
                              <div key={tIdx} style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: trail.action === 'APPROVE' ? 'var(--color-primary)' : trail.action === 'UPDATE' ? 'var(--color-warning)' : 'var(--color-neutral)', border: '2px solid #0f1422' }} />
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  <strong>{trail.action}</strong> by {trail.user_detail?.username || 'System Engine'} on {new Date(trail.timestamp).toLocaleString()}
                                </div>
                                {trail.field_name && (
                                  <div style={{ fontSize: '11px', background: 'rgba(0,0,0,0.15)', padding: '4px 8px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                                    Modified <code style={{ color: 'var(--color-secondary)' }}>{trail.field_name}</code>: <span style={{ textDecoration: 'line-through', color: 'var(--color-danger)' }}>{trail.old_value}</span> ➡ <span style={{ color: 'var(--color-primary)' }}>{trail.new_value}</span>
                                  </div>
                                )}
                                {trail.comment && (
                                  <p style={{ fontSize: '13px', fontStyle: 'italic', marginTop: '4px', color: 'var(--text-main)' }}>
                                    "{trail.comment}"
                                  </p>
                                )}
                              </div>
                            ))}
                            {(!selectedRecord.audit_trail || selectedRecord.audit_trail.length === 0) && (
                              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No manual audit adjustments recorded yet.</p>
                            )}
                          </div>
                        </div>

                        {/* EDIT MODE TOGGLE FORM */}
                        {selectedRecord.status !== 'AUDIT_LOCKED' && (
                          <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px', marginTop: '20px' }}>
                            {!editMode ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn" onClick={() => setEditMode(true)}>
                                  <Edit3 size={14} /> Adjust Values (Manual Override)
                                </button>
                                <button className="btn warning" onClick={() => handleApprove(selectedRecord.id)}>
                                  Approve Row
                                </button>
                                <button className="btn danger" onClick={() => handleReject(selectedRecord.id)}>
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)' }}>
                                <h4 style={{ fontSize: '13px', color: 'var(--color-warning)', marginBottom: '12px' }}>Operational Override Mode</h4>
                                
                                <div className="form-group">
                                  <label>Normalized Quantity ({selectedRecord.normalized_unit})</label>
                                  <input className="form-control" type="number" value={editQty} onChange={e => setEditQty(e.target.value)} />
                                </div>
                                <div className="form-group">
                                  <label>Emissions impact (kg CO2e)</label>
                                  <input className="form-control" type="number" value={editCo2e} onChange={e => setEditCo2e(e.target.value)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                  <div className="form-group">
                                    <label>Start Date</label>
                                    <input className="form-control" type="date" value={editStart} onChange={e => setEditStart(e.target.value)} />
                                  </div>
                                  <div className="form-group">
                                    <label>End Date</label>
                                    <input className="form-control" type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                                  </div>
                                </div>
                                <div className="form-group">
                                  <label>Audit Trail Reason / Explanation (Required for auditor review)</label>
                                  <textarea className="form-control" rows={3} placeholder="e.g. Corrected PG&E billing meter reading error from utility portal CSV" value={editComment} onChange={e => setEditComment(e.target.value)} required />
                                </div>

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                  <button className="btn secondary" onClick={() => setEditMode(false)}>Cancel</button>
                                  <button className="btn" onClick={handleSaveEdit} disabled={!editComment}>
                                    Save & Log Audit Trail
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {selectedRecord.status === 'AUDIT_LOCKED' && (
                          <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px', display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-dim)' }}>
                            <Lock size={16} /> <span>This record is Locked for Audit assurance and cannot be modified.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. PIPELINES LOGS VIEW */}
            {activeTab === 'jobs' && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2>Data Pipelines Execution Log</h2>
                  <p style={{ color: 'var(--text-muted)' }}>Monitor background file uploads, API fetches, processing results, and error logs.</p>
                </div>

                <div className="records-table-container">
                  <table className="records-table">
                    <thead>
                      <tr>
                        <th>Pipelines Run ID</th>
                        <th>Source Connection</th>
                        <th>Target File / Feed</th>
                        <th>Status</th>
                        <th>Ingested Lines</th>
                        <th>Failed Lines</th>
                        <th>Execution Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{job.id.substring(0, 18)}...</div>
                          </td>
                          <td>
                            <span className={`source-badge ${job.source_type?.toLowerCase() || 'travel'}`}>
                              {job.source_connection_name}
                            </span>
                          </td>
                          <td>{job.filename || 'Simulated Feed Connection'}</td>
                          <td>
                            <span className={`status-badge ${job.status === 'SUCCESS' ? 'approved' : job.status === 'PARTIAL_SUCCESS' ? 'flagged' : 'rejected'}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--color-primary)' }}>{job.records_processed}</strong>
                          </td>
                          <td>
                            <strong style={{ color: job.records_failed > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                              {job.records_failed}
                            </strong>
                          </td>
                          <td>{new Date(job.started_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {jobs.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                            No ingestion pipelines have executed yet. Upload data to view telemetry logs.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Show detailed pipeline logs in card if any job has failure logs */}
                {jobs.some(j => j.logs) && (
                  <div style={{ marginTop: '32px' }}>
                    <h3>Diagnostic Logs Ledger</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                      {jobs.filter(j => j.logs).map((job) => (
                        <div key={job.id} className="glass-panel" style={{ borderLeft: '4px solid var(--color-danger)' }}>
                          <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>
                            Warnings on Run ID: <code style={{ color: 'var(--color-secondary)' }}>{job.id}</code> ({job.filename})
                          </h4>
                          <pre className="code-block" style={{ color: '#ef4444', maxHeight: '150px' }}>{job.logs}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
