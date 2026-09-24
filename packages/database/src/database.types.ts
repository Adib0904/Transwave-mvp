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
          vat_number: string | null
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
          vat_number?: string | null
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
          vat_number?: string | null
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
          chargeable_weight_kg_snapshot: number | null
          commodity_snapshot: string | null
          company_address_snapshot: string | null
          company_id: string
          company_name_snapshot: string
          company_trn_snapshot: string | null
          consignee_snapshot: string | null
          containers_snapshot: Json
          created_at: string
          created_by: string
          customer_address_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_reference_snapshot: string | null
          customer_trn_snapshot: string | null
          customer_vat_number_snapshot: string | null
          customs_doc_reference_snapshot: string | null
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
          notify_name_snapshot: string | null
          origin_port_snapshot: string | null
          package_count_snapshot: number | null
          payment_terms_days_snapshot: number
          remarks: string | null
          place_of_delivery_snapshot: string | null
          planned_container_count_snapshot: number
          planned_container_type_snapshot: string
          pod_snapshot: string
          pol_snapshot: string
          sailed_at_snapshot: string | null
          sales_person_snapshot: string | null
          shipment_terms_snapshot: string | null
          shipper_snapshot: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed: number
          total_aed: number
          transport_mode_snapshot: Database["public"]["Enums"]["transport_mode"]
          transshipment_port_snapshot: string | null
          updated_at: string
          vat_amount_aed: number
          vessel_snapshot: string | null
          volume_cbm_snapshot: number | null
          voyage_snapshot: string | null
          weight_kg_snapshot: number | null
        }
        Insert: {
          branch_address_snapshot?: string | null
          branch_code_snapshot: string
          branch_id: string
          branch_name_snapshot: string
          chargeable_weight_kg_snapshot?: number | null
          commodity_snapshot?: string | null
          company_address_snapshot?: string | null
          company_id: string
          company_name_snapshot: string
          company_trn_snapshot?: string | null
          consignee_snapshot?: string | null
          containers_snapshot?: Json
          created_at?: string
          created_by?: string
          customer_address_snapshot?: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_reference_snapshot?: string | null
          customer_trn_snapshot?: string | null
          customer_vat_number_snapshot?: string | null
          customs_doc_reference_snapshot?: string | null
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
          notify_name_snapshot?: string | null
          origin_port_snapshot?: string | null
          package_count_snapshot?: number | null
          payment_terms_days_snapshot: number
          remarks?: string | null
          place_of_delivery_snapshot?: string | null
          planned_container_count_snapshot: number
          planned_container_type_snapshot: string
          pod_snapshot: string
          pol_snapshot: string
          sailed_at_snapshot?: string | null
          sales_person_snapshot?: string | null
          shipment_terms_snapshot?: string | null
          shipper_snapshot?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed?: number
          total_aed?: number
          transport_mode_snapshot: Database["public"]["Enums"]["transport_mode"]
          transshipment_port_snapshot?: string | null
          updated_at?: string
          vat_amount_aed?: number
          vessel_snapshot?: string | null
          volume_cbm_snapshot?: number | null
          voyage_snapshot?: string | null
          weight_kg_snapshot?: number | null
        }
        Update: {
          branch_address_snapshot?: string | null
          branch_code_snapshot?: string
          branch_id?: string
          branch_name_snapshot?: string
          chargeable_weight_kg_snapshot?: number | null
          commodity_snapshot?: string | null
          company_address_snapshot?: string | null
          company_id?: string
          company_name_snapshot?: string
          company_trn_snapshot?: string | null
          consignee_snapshot?: string | null
          containers_snapshot?: Json
          created_at?: string
          created_by?: string
          customer_address_snapshot?: string | null
          customer_id?: string
          customer_name_snapshot?: string
          customer_reference_snapshot?: string | null
          customer_trn_snapshot?: string | null
          customer_vat_number_snapshot?: string | null
          customs_doc_reference_snapshot?: string | null
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
          notify_name_snapshot?: string | null
          origin_port_snapshot?: string | null
          package_count_snapshot?: number | null
          payment_terms_days_snapshot?: number
          remarks?: string | null
          place_of_delivery_snapshot?: string | null
          planned_container_count_snapshot?: number
          planned_container_type_snapshot?: string
          pod_snapshot?: string
          pol_snapshot?: string
          sailed_at_snapshot?: string | null
          sales_person_snapshot?: string | null
          shipment_terms_snapshot?: string | null
          shipper_snapshot?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_aed?: number
          total_aed?: number
          transport_mode_snapshot?: Database["public"]["Enums"]["transport_mode"]
          transshipment_port_snapshot?: string | null
          updated_at?: string
          vat_amount_aed?: number
          vessel_snapshot?: string | null
          volume_cbm_snapshot?: number | null
          voyage_snapshot?: string | null
          weight_kg_snapshot?: number | null
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
          company_id: string | null
          country_code: string
          emirate: string | null
          id: string
          name: string
          un_locode: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          country_code: string
          emirate?: string | null
          id?: string
          name: string
          un_locode?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          country_code?: string
          emirate?: string | null
          id?: string
          name?: string
          un_locode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          chargeable_weight_kg: number | null
          commodity: string | null
          company_id: string
          consignee: string | null
          created_at: string
          customer_reference: string | null
          customs_doc_reference: string | null
          hbl: string | null
          job_id: string
          mbl: string | null
          notify_name: string | null
          origin_port: string | null
          package_count: number | null
          place_of_delivery: string | null
          port_of_discharge_id: string
          port_of_loading_id: string
          sailed_at: string | null
          sales_person: string | null
          shipment_terms: string | null
          shipper: string | null
          transshipment_port_id: string | null
          updated_at: string
          vessel: string | null
          volume_cbm: number | null
          voyage: string | null
          weight_kg: number | null
        }
        Insert: {
          chargeable_weight_kg?: number | null
          commodity?: string | null
          company_id: string
          consignee?: string | null
          created_at?: string
          customer_reference?: string | null
          customs_doc_reference?: string | null
          hbl?: string | null
          job_id: string
          mbl?: string | null
          notify_name?: string | null
          origin_port?: string | null
          package_count?: number | null
          place_of_delivery?: string | null
          port_of_discharge_id: string
          port_of_loading_id: string
          sailed_at?: string | null
          sales_person?: string | null
          shipment_terms?: string | null
          shipper?: string | null
          transshipment_port_id?: string | null
          updated_at?: string
          vessel?: string | null
          volume_cbm?: number | null
          voyage?: string | null
          weight_kg?: number | null
        }
        Update: {
          chargeable_weight_kg?: number | null
          commodity?: string | null
          company_id?: string
          consignee?: string | null
          created_at?: string
          customer_reference?: string | null
          customs_doc_reference?: string | null
          hbl?: string | null
          job_id?: string
          mbl?: string | null
          notify_name?: string | null
          origin_port?: string | null
          package_count?: number | null
          place_of_delivery?: string | null
          port_of_discharge_id?: string
          port_of_loading_id?: string
          sailed_at?: string | null
          sales_person?: string | null
          shipment_terms?: string | null
          shipper?: string | null
          transshipment_port_id?: string | null
          updated_at?: string
          vessel?: string | null
          volume_cbm?: number | null
          voyage?: string | null
          weight_kg?: number | null
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
          {
            foreignKeyName: "shipments_transshipment_port_id_fkey"
            columns: ["transshipment_port_id"]
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
      vendor_bill_lines: {
        Row: {
          company_id: string
          created_at: string
          currency_code: string
          description: string
          exchange_rate: number
          id: string
          line_number: number
          net_amount_aed: number | null
          quantity: number
          service_id: string | null
          tax_rate: number
          total_amount_aed: number | null
          unit_rate: number
          uom: string
          vat_amount_aed: number | null
          vendor_bill_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency_code: string
          description: string
          exchange_rate: number
          id?: string
          line_number: number
          net_amount_aed?: number | null
          quantity: number
          service_id?: string | null
          tax_rate?: number
          total_amount_aed?: number | null
          unit_rate: number
          uom: string
          vat_amount_aed?: number | null
          vendor_bill_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency_code?: string
          description?: string
          exchange_rate?: number
          id?: string
          line_number?: number
          net_amount_aed?: number | null
          quantity?: number
          service_id?: string | null
          tax_rate?: number
          total_amount_aed?: number | null
          unit_rate?: number
          uom?: string
          vat_amount_aed?: number | null
          vendor_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bill_lines_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vendor_bill_lines_service_id_company_id_fkey"
            columns: ["service_id", "company_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "vendor_bill_lines_vendor_bill_id_company_id_fkey"
            columns: ["vendor_bill_id", "company_id"]
            isOneToOne: false
            referencedRelation: "vendor_bills"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      vendor_bills: {
        Row: {
          bill_date: string
          bl_number: string | null
          company_id: string
          created_at: string
          customer_invoice_id: string | null
          date_of_supply: string | null
          department: string | null
          due_date: string | null
          id: string
          job_id: string
          remarks: string | null
          revenue_allocated_aed: number
          source_file_name: string | null
          source_file_path: string | null
          status: string
          updated_at: string
          vendor_id: string
          vendor_invoice_number: string
        }
        Insert: {
          bill_date: string
          bl_number?: string | null
          company_id: string
          created_at?: string
          customer_invoice_id?: string | null
          date_of_supply?: string | null
          department?: string | null
          due_date?: string | null
          id?: string
          job_id: string
          remarks?: string | null
          revenue_allocated_aed?: number
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
          vendor_invoice_number: string
        }
        Update: {
          bill_date?: string
          bl_number?: string | null
          company_id?: string
          created_at?: string
          customer_invoice_id?: string | null
          date_of_supply?: string | null
          department?: string | null
          due_date?: string | null
          id?: string
          job_id?: string
          remarks?: string | null
          revenue_allocated_aed?: number
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_invoice_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_customer_invoice_id_company_id_fkey"
            columns: ["customer_invoice_id", "company_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "vendor_bills_job_id_company_id_fkey"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "vendor_bills_vendor_id_company_id_fkey"
            columns: ["vendor_id", "company_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      vendors: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          default_currency: string
          email: string | null
          id: string
          legal_name: string
          payment_terms_days: number
          phone: string | null
          trn: string | null
          updated_at: string
          vendor_code: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          default_currency?: string
          email?: string | null
          id?: string
          legal_name: string
          payment_terms_days?: number
          phone?: string | null
          trn?: string | null
          updated_at?: string
          vendor_code?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          default_currency?: string
          email?: string | null
          id?: string
          legal_name?: string
          payment_terms_days?: number
          phone?: string | null
          trn?: string | null
          updated_at?: string
          vendor_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_vendor_bill_document: {
        Args: { p_file_name: string; p_id: string; p_storage_path: string }
        Returns: undefined
      }
      create_invoice_draft: {
        Args: { p_charge_ids: string[]; p_job_id: string }
        Returns: string
      }
      create_job: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_customer_id: string
          p_hbl: string
          p_job_number: string
          p_mbl: string
          p_planned_container_count: number
          p_planned_container_type: string
          p_pod_id: string
          p_pol_id: string
          p_service_ids: string[]
          p_status: Database["public"]["Enums"]["job_status"]
          p_transport_mode: Database["public"]["Enums"]["transport_mode"]
          p_transshipment_port_id: string
          p_vessel: string
          p_voyage: string
        }
        Returns: string
      }
      create_job_with_details: {
        Args: {
          p_branch_id: string
          p_chargeable_weight_kg: number
          p_commodity: string
          p_company_id: string
          p_consignee: string
          p_container_numbers: string[]
          p_customer_id: string
          p_customer_reference: string
          p_customs_doc_reference: string
          p_hbl: string
          p_mbl: string
          p_notify_name: string
          p_origin_port: string
          p_package_count: number
          p_place_of_delivery: string
          p_planned_container_count: number
          p_planned_container_type: string
          p_pod_id: string
          p_pol_id: string
          p_sailed_at: string
          p_sales_person: string
          p_service_ids: string[]
          p_shipment_terms: string
          p_shipper: string
          p_status: Database["public"]["Enums"]["job_status"]
          p_transport_mode: Database["public"]["Enums"]["transport_mode"]
          p_transshipment_port_id: string
          p_vessel: string
          p_volume_cbm: number
          p_voyage: string
          p_weight_kg: number
        }
        Returns: string
      }
      create_similar_job: { Args: { p_source_job_id: string }; Returns: string }
      delete_vendor_bill: { Args: { p_id: string }; Returns: undefined }
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
      update_invoice: {
        Args: {
          p_customer_address: string | null
          p_customer_name: string
          p_customer_trn: string | null
          p_customer_vat_number: string | null
          p_due_date: string | null
          p_invoice_date: string
          p_invoice_id: string
          p_lines: Json
          p_remarks: string | null
        }
        Returns: string
      }
      save_job_charge: {
        Args: {
          p_currency_code: string
          p_description: string
          p_exchange_rate: number
          p_job_id: string
          p_job_service_id: string
          p_quantity: number
          p_tax_rate_id: string
          p_unit_rate: number
          p_uom: string
        }
        Returns: string
      }
      save_vendor_bill: {
        Args: {
          p_bill_date: string
          p_bl_number: string
          p_customer_invoice_id: string
          p_date_of_supply: string
          p_department: string
          p_due_date: string
          p_id: string
          p_job_id: string
          p_lines: Json
          p_remarks: string
          p_revenue_allocated_aed: number
          p_source_file_name: string
          p_status: string
          p_vendor_id: string
          p_vendor_invoice_number: string
        }
        Returns: string
      }
      update_job: {
        Args: {
          p_branch_id: string
          p_customer_id: string
          p_hbl: string
          p_job_id: string
          p_job_number: string
          p_mbl: string
          p_planned_container_count: number
          p_planned_container_type: string
          p_pod_id: string
          p_pol_id: string
          p_service_ids: string[]
          p_status: Database["public"]["Enums"]["job_status"]
          p_transport_mode: Database["public"]["Enums"]["transport_mode"]
          p_transshipment_port_id: string
          p_vessel: string
          p_voyage: string
        }
        Returns: string
      }
      update_job_with_details: {
        Args: {
          p_branch_id: string
          p_chargeable_weight_kg: number
          p_commodity: string
          p_consignee: string
          p_container_numbers: string[]
          p_customer_id: string
          p_customer_reference: string
          p_customs_doc_reference: string
          p_hbl: string
          p_job_id: string
          p_mbl: string
          p_notify_name: string
          p_origin_port: string
          p_package_count: number
          p_place_of_delivery: string
          p_planned_container_count: number
          p_planned_container_type: string
          p_pod_id: string
          p_pol_id: string
          p_sailed_at: string
          p_sales_person: string
          p_service_ids: string[]
          p_shipment_terms: string
          p_shipper: string
          p_status: Database["public"]["Enums"]["job_status"]
          p_transport_mode: Database["public"]["Enums"]["transport_mode"]
          p_transshipment_port_id: string
          p_vessel: string
          p_volume_cbm: number
          p_voyage: string
          p_weight_kg: number
        }
        Returns: string
      }
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
