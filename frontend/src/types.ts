export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

export interface Facility {
  id: string;
  tenant: string;
  name: string;
  facility_code: string;
  country: string;
  region: string;
}

export interface SourceConnection {
  id: string;
  tenant: string;
  name: string;
  source_type: 'SAP' | 'UTILITY' | 'TRAVEL';
  connection_details: Record<string, any>;
}

export interface IngestionJob {
  id: string;
  tenant: string;
  source_connection: string | null;
  source_connection_name?: string;
  source_type?: 'SAP' | 'UTILITY' | 'TRAVEL';
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  filename: string | null;
  file_hash: string | null;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_failed: number;
  logs: string | null;
}

export interface AuditTrail {
  id: string;
  normalized_activity: string;
  user: number | null;
  user_detail?: {
    id: number;
    username: string;
    email: string;
  };
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'FLAG' | 'REJECT' | 'LOCK';
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  timestamp: string;
}

export interface NormalizedActivity {
  id: string;
  tenant: string;
  raw_record: string | null;
  raw_payload?: Record<string, any> | null;
  facility: string | null;
  facility_detail?: Facility | null;
  activity_type: 'FUEL' | 'PROCUREMENT' | 'ELECTRICITY' | 'FLIGHT' | 'HOTEL' | 'GROUND_TRANSPORT';
  scope: 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';
  ghg_category: string;
  start_date: string;
  end_date: string;
  raw_quantity: string;
  raw_unit: string;
  normalized_quantity: string;
  normalized_unit: string;
  co2e_kg: string;
  emission_factor_used: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'FLAGGED' | 'REJECTED' | 'AUDIT_LOCKED';
  flag_reason: string | null;
  created_at: string;
  updated_at: string;
  audit_trail?: AuditTrail[];
}

export interface DashboardStats {
  total_co2e_kg: number;
  scopes: {
    scope1: number;
    scope2: number;
    scope3: number;
  };
  facilities: {
    name: string;
    code: string;
    co2e_kg: number;
  }[];
  categories: {
    name: string;
    co2e_kg: number;
  }[];
  quality: {
    total: number;
    pending_review: number;
    approved: number;
    flagged: number;
    rejected: number;
    audit_locked: number;
  };
  trend: {
    month: string;
    co2e_kg: number;
  }[];
}
