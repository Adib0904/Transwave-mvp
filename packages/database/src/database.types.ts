export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          company_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string
          company_id: string
          created_at?: string
          details?: Json
          entity_id: string
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          code: string
          company_id: string
          created_at: string
          emirate: string
          id: string
          name: string
          trn: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code: string
          company_id: string
          created_at?: string
          emirate: string
          id?: string
          name: string
          trn?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string
          company_id?: string
          created_at?: string
          emirate?: string
          id?: string
          name?: string
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          id: string
          legal_name: string
          trade_name: string | null
          trn: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          legal_name: string
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          legal_name?: string
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          company_id: string
          container_number: string
          container_type: string
          created_at: string
          gross_weight_kg: number | null
          id: string
          job_id: string
          package_count: number | null
          seal_number: string | null
          size: number
          updated_at: string
        }
        Insert: {
          company_id: string
          container_number: string
          container_type: string
          created_at?: string
          gross_weight_kg?: number | null
          id?: string
          job_id: string
          package_count?: number | null
          seal_number?: string | null
          size: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          container_number?: string
          container_type?: string
          created_at?: string
          gross_weight_kg?: number | null
          id?: string
          job_id?: string
          package_count?: number | null
          seal_number?: string | null
          size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimal_places: number
          name: string
        }
        Insert: {
          code: string
          decimal_places?: number
          name: string
        }
        Update: {
          code?: string
          decimal_places?: number
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          active: boolean
          billing_address: string | null
          company_id: string
          company_name: string
          created_at: string
          customer_code: string
          default_currency: string
          email: string | null
          id: string
          payment_terms_days: number
          phone: string | null
          trn: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_address?: string | null
          company_id: string
          company_name: string
          created_at?: string
          customer_code: string
          default_currency: string
          email?: string | null
          id?: string
          payment_terms_days?: number
          phone?: string | null
          trn?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_address?: string | null
          company_id?: string
          company_name?: string
          created_at?: string
          customer_code?: string
          default_currency?: string
          email?: string | null
          id?: string
          payment_terms_days?: number
          phone?: string | null
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      invoice_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          document_type: string
          id: string
          invoice_id: string
          storage_path: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string
          document_type?: string
          id?: string
          invoice_id: string
          storage_path: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          document_type?: string
          id?: string
          invoice_id?: string
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_invoice_id_company_id_fkey"
            columns: ["invoice_id", "company_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          company_id: string
          created_at: string
          currency_code_snapshot: string
          description_snapshot: string
          exchange_rate_snapshot: number
          id: string
          invoice_id: string
          job_charge_id: string
          line_number: number
          quantity: number
          service_code_snapshot: string
          service_name_snapshot: string
          tax_code_snapshot: string
          tax_rate_snapshot: number
          taxable_amount_aed: number
          total_amount_aed: number
          unit_rate_snapshot: number
          uom_snapshot: string
          vat_amount_aed: number
        }
        Insert: {
          company_id: string
          created_at?: string
          currency_code_snapshot: string
          description_snapshot: string
          exchange_rate_snapshot: number
          id?: string
          invoice_id: string
          job_charge_id: string
          line_number: number
          quantity: number
          service_code_snapshot: string
          service_name_snapshot: string
          tax_code_snapshot: string
          tax_rate_snapshot: number
          taxable_amount_aed: number
          total_amount_aed: number
          unit_rate_snapshot: number
          uom_snapshot: string
          vat_amount_aed: number
        }
        Update: {
          company_id?: string
          created_at?: string
          currency_code_snapshot?: string
          description_snapshot?: string
          exchange_rate_snapshot?: number
          id?: string
          invoice_id?: string
          job_charge_id?: string
          line_number?: number
          quantity?: number
          service_code_snapshot?: string
          service_name_snapshot?: string
          tax_code_snapshot?: string
          tax_rate_snapshot?: number
          taxable_amount_aed?: number
          total_amount_aed?: number
          unit_rate_snapshot?: number
          uom_snapshot?: string
          vat_amount_aed?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_company_id_fkey"
            columns: ["invoice_id", "company_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "invoice_lines_job_charge_id_company_id_fkey"
            columns: ["job_charge_id", "company_id"]
            isOneToOne: false
            referencedRelation: "job_charges"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          branch_id: string
          company_id: string
          financial_year: number
          next_number: number
        }
        Insert: {
          branch_id: string
          company_id: string
          financial_year: number
          next_number: number
        }
        Update: {
          branch_id?: string
          company_id?: string
          financial_year?: number
          next_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_branch_id_company_id_fkey"
            columns: ["branch_id", "company_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "invoice_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_address_snapshot: string | null
          branch_code_snapshot: string
          branch_id: string
          branch_name_snapshot: string
          company_address_snapshot: string | null
          company_id: string
          company_name_snapshot: string
          company_trn_snapshot: string | null
          containers_snapshot: Json
          created_at: string
          created_by: string
          customer_address_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_trn_snapshot: string | null
          draft_reference: string
          due_date: string | null
          hbl_snapshot: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          job_id: string
          job_number_snapshot: string
          mbl_snapshot: string | null
          payment_terms_days_snapshot: number
          planned_container_count_snapshot: number
          planned_container_type_snapshot: string
          pod_snapshot: string
          pol_snapshot: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed: number
          total_aed: number
          transport_mode_snapshot: Database["public"]["Enums"]["transport_mode"]
          updated_at: string
          vat_amount_aed: number
          vessel_snapshot: string | null
          voyage_snapshot: string | null
        }
        Insert: {
          branch_address_snapshot?: string | null
          branch_code_snapshot: string
          branch_id: string
          branch_name_snapshot: string
          company_address_snapshot?: string | null
          company_id: string
          company_name_snapshot: string
          company_trn_snapshot?: string | null
          containers_snapshot?: Json
          created_at?: string
          created_by?: string
          customer_address_snapshot?: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_trn_snapshot?: string | null
          draft_reference?: string
          due_date?: string | null
          hbl_snapshot?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          issued_at?: string | null
          job_id: string
          job_number_snapshot: string
          mbl_snapshot?: string | null
          payment_terms_days_snapshot: number
          planned_container_count_snapshot: number
          planned_container_type_snapshot: string
          pod_snapshot: string
          pol_snapshot: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed?: number
          total_aed?: number
          transport_mode_snapshot: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
          vat_amount_aed?: number
          vessel_snapshot?: string | null
          voyage_snapshot?: string | null
        }
        Update: {
          branch_address_snapshot?: string | null
          branch_code_snapshot?: string
          branch_id?: string
          branch_name_snapshot?: string
          company_address_snapshot?: string | null
          company_id?: string
          company_name_snapshot?: string
          company_trn_snapshot?: string | null
          containers_snapshot?: Json
          created_at?: string
          created_by?: string
          customer_address_snapshot?: string | null
          customer_id?: string
          customer_name_snapshot?: string
          customer_trn_snapshot?: string | null
          draft_reference?: string
          due_date?: string | null
          hbl_snapshot?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          issued_at?: string | null
          job_id?: string
          job_number_snapshot?: string
          mbl_snapshot?: string | null
          payment_terms_days_snapshot?: number
          planned_container_count_snapshot?: number
          planned_container_type_snapshot?: string
          pod_snapshot?: string
          pol_snapshot?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed?: number
          total_aed?: number
          transport_mode_snapshot?: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
          vat_amount_aed?: number
          vessel_snapshot?: string | null
          voyage_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_company_id_fkey"
            columns: ["branch_id", "company_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_company_id_fkey"
            columns: ["customer_id", "company_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "invoices_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      job_charges: {
        Row: {
          company_id: string
          created_at: string
          currency_code: string
          description: string
          exchange_rate: number
          id: string
          job_id: string
          job_service_id: string
          net_amount_aed: number | null
          quantity: number
          tax_rate_id: string
          unit_rate: number
          uom: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency_code: string
          description: string
          exchange_rate: number
          id?: string
          job_id: string
          job_service_id: string
          net_amount_aed?: number | null
          quantity: number
          tax_rate_id: string
          unit_rate: number
          uom: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency_code?: string
          description?: string
          exchange_rate?: number
          id?: string
          job_id?: string
          job_service_id?: string
          net_amount_aed?: number | null
          quantity?: number
          tax_rate_id?: string
          unit_rate?: number
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_charges_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "job_charges_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "job_charges_job_service_id_company_id_fkey"
            columns: ["job_service_id", "company_id"]
            isOneToOne: false
            referencedRelation: "job_services"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "job_charges_tax_rate_id_company_id_fkey"
            columns: ["tax_rate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      job_services: {
        Row: {
          company_id: string
          created_at: string
          id: string
          job_id: string
          service_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          service_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_services_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "job_services_service_id_company_id_fkey"
            columns: ["service_id", "company_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      jobs: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          customer_id: string
          id: string
          job_number: string
          opened_at: string
          planned_container_count: number
          planned_container_type: string
          status: Database["public"]["Enums"]["job_status"]
          transport_mode: Database["public"]["Enums"]["transport_mode"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          job_number: string
          opened_at?: string
          planned_container_count: number
          planned_container_type: string
          status?: Database["public"]["Enums"]["job_status"]
          transport_mode: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          job_number?: string
          opened_at?: string
          planned_container_count?: number
          planned_container_type?: string
          status?: Database["public"]["Enums"]["job_status"]
          transport_mode?: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_branch_id_company_id_fkey"
            columns: ["branch_id", "company_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_company_id_fkey"
            columns: ["customer_id", "company_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      ports: {
        Row: {
          active: boolean
          country_code: string
          emirate: string | null
          id: string
          name: string
          un_locode: string | null
        }
        Insert: {
          active?: boolean
          country_code: string
          emirate?: string | null
          id?: string
          name: string
          un_locode?: string | null
        }
        Update: {
          active?: boolean
          country_code?: string
          emirate?: string | null
          id?: string
          name?: string
          un_locode?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          code: string
          company_id: string
          created_at: string
          default_currency: string
          default_tax_rate_id: string
          default_uom: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          company_id: string
          created_at?: string
          default_currency: string
          default_tax_rate_id: string
          default_uom: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          company_id?: string
          created_at?: string
          default_currency?: string
          default_tax_rate_id?: string
          default_uom?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "services_default_tax_rate_id_company_id_fkey"
            columns: ["default_tax_rate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      shipments: {
        Row: {
          commodity: string | null
          company_id: string
          created_at: string
          hbl: string | null
          job_id: string
          mbl: string | null
          place_of_delivery: string | null
          port_of_discharge_id: string
          port_of_loading_id: string
          sailed_at: string | null
          updated_at: string
          vessel: string | null
          voyage: string | null
        }
        Insert: {
          commodity?: string | null
          company_id: string
          created_at?: string
          hbl?: string | null
          job_id: string
          mbl?: string | null
          place_of_delivery?: string | null
          port_of_discharge_id: string
          port_of_loading_id: string
          sailed_at?: string | null
          updated_at?: string
          vessel?: string | null
          voyage?: string | null
        }
        Update: {
          commodity?: string | null
          company_id?: string
          created_at?: string
          hbl?: string | null
          job_id?: string
          mbl?: string | null
          place_of_delivery?: string | null
          port_of_discharge_id?: string
          port_of_loading_id?: string
          sailed_at?: string | null
          updated_at?: string
          vessel?: string | null
          voyage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "shipments_port_of_discharge_id_fkey"
            columns: ["port_of_discharge_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_port_of_loading_id_fkey"
            columns: ["port_of_loading_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          category: Database["public"]["Enums"]["tax_category"]
          code: string
          company_id: string
          effective_from: string
          effective_to: string | null
          id: string
          rate: number
        }
        Insert: {
          category: Database["public"]["Enums"]["tax_category"]
          code: string
          company_id: string
          effective_from: string
          effective_to?: string | null
          id?: string
          rate: number
        }
        Update: {
          category?: Database["public"]["Enums"]["tax_category"]
          code?: string
          company_id?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_invoice_draft: {
        Args: { p_charge_ids: string[]; p_job_id: string }
        Returns: string
      }
      has_company_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["company_role"][]
          target_company_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      issue_invoice: { Args: { p_invoice_id: string }; Returns: string }
    }
    Enums: {
      company_role: "OWNER" | "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER"
      invoice_status: "DRAFT" | "ISSUED" | "VOID"
      job_status:
        | "DRAFT"
        | "OPEN"
        | "COMPLETED"
        | "READY_TO_INVOICE"
        | "CANCELLED"
      tax_category: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "OUT_OF_SCOPE"
      transport_mode: "SEA" | "AIR" | "ROAD" | "MULTIMODAL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      company_role: ["OWNER", "ADMIN", "OPERATIONS", "FINANCE", "VIEWER"],
      invoice_status: ["DRAFT", "ISSUED", "VOID"],
      job_status: [
        "DRAFT",
        "OPEN",
        "COMPLETED",
        "READY_TO_INVOICE",
        "CANCELLED",
      ],
      tax_category: ["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"],
      transport_mode: ["SEA", "AIR", "ROAD", "MULTIMODAL"],
    },
  },
} as const

