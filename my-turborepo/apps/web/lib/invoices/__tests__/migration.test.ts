/**
 * Tests for Invoice Migration SQL (Component 12 - Step 1)
 *
 * Validates the migration SQL structure without running against a database.
 * Tests check that required tables, columns, constraints, and functions are defined.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATION_PATH = path.join(
  __dirname,
  "../../../supabase/migrations/20260305000001_create_invoices.sql"
);

let migrationSQL: string;

beforeAll(() => {
  migrationSQL = fs.readFileSync(MIGRATION_PATH, "utf-8");
});

describe("Invoice Migration SQL Structure", () => {
  describe("Invoice Table Enhancements", () => {
    it("should add tipo_comprobante column", () => {
      expect(migrationSQL).toContain("tipo_comprobante");
      expect(migrationSQL).toContain("VARCHAR(1)");
      expect(migrationSQL).toContain("DEFAULT 'I'");
    });

    it("should add issue_date column", () => {
      expect(migrationSQL).toContain("issue_date TIMESTAMP");
      expect(migrationSQL).toContain("DEFAULT NOW()");
    });

    it("should add issuer denormalized fields", () => {
      expect(migrationSQL).toContain("issuer_rfc VARCHAR(13)");
      expect(migrationSQL).toContain("issuer_name VARCHAR(254)");
      expect(migrationSQL).toContain("issuer_tax_regime VARCHAR(3)");
      expect(migrationSQL).toContain("issuer_zip_code VARCHAR(5)");
    });

    it("should add receiver denormalized fields", () => {
      expect(migrationSQL).toContain("receiver_rfc VARCHAR(13)");
      expect(migrationSQL).toContain("receiver_name VARCHAR(254)");
      expect(migrationSQL).toContain("receiver_tax_regime VARCHAR(3)");
      expect(migrationSQL).toContain("receiver_zip_code VARCHAR(5)");
      expect(migrationSQL).toContain("receiver_cfdi_use VARCHAR(3)");
    });

    it("should add exportacion field (required CFDI 4.0)", () => {
      expect(migrationSQL).toContain("exportacion VARCHAR(2)");
      expect(migrationSQL).toContain("DEFAULT '01'");
    });

    it("should add tax breakdown fields with proper precision", () => {
      expect(migrationSQL).toContain("total_iva_trasladado DECIMAL(18, 6)");
      expect(migrationSQL).toContain("total_iva_retenido DECIMAL(18, 6)");
      expect(migrationSQL).toContain("total_isr_retenido DECIMAL(18, 6)");
    });

    it("should add global invoice fields", () => {
      expect(migrationSQL).toContain("is_global BOOLEAN");
      expect(migrationSQL).toContain("global_periodicity VARCHAR(2)");
      expect(migrationSQL).toContain("global_months VARCHAR(2)");
      expect(migrationSQL).toContain("global_year VARCHAR(4)");
    });

    it("should add cancellation fields", () => {
      expect(migrationSQL).toContain("cancellation_uuid VARCHAR(36)");
      expect(migrationSQL).toContain("cancellation_response_code VARCHAR(5)");
    });

    it("should add folio_number_int as INTEGER", () => {
      expect(migrationSQL).toContain("folio_number_int INTEGER");
    });
  });

  describe("Invoice Items Table Enhancements", () => {
    it("should add sort_order column", () => {
      expect(migrationSQL).toContain("sort_order INTEGER");
    });

    it("should add SAT code fields", () => {
      expect(migrationSQL).toContain("sat_product_code VARCHAR(8)");
      expect(migrationSQL).toContain("sat_unit_code VARCHAR(10)");
    });

    it("should add unit_name and sku fields", () => {
      expect(migrationSQL).toContain("unit_name VARCHAR(50)");
      expect(migrationSQL).toContain("sku VARCHAR(100)");
    });

    it("should add tax_object field", () => {
      expect(migrationSQL).toContain("tax_object VARCHAR(2)");
      expect(migrationSQL).toContain("DEFAULT '02'");
    });

    it("should add IVA fields with proper precision", () => {
      expect(migrationSQL).toContain("iva_rate DECIMAL(6, 4)");
      expect(migrationSQL).toContain("iva_exempt BOOLEAN");
      expect(migrationSQL).toContain("iva_trasladado DECIMAL(18, 6)");
    });

    it("should add IVA retention fields", () => {
      expect(migrationSQL).toContain("iva_retention_rate DECIMAL(6, 4)");
      expect(migrationSQL).toContain("iva_retenido DECIMAL(18, 6)");
    });

    it("should add ISR retention fields", () => {
      expect(migrationSQL).toContain("isr_retention_rate DECIMAL(6, 4)");
      expect(migrationSQL).toContain("isr_retenido DECIMAL(18, 6)");
    });
  });

  describe("Invoice Related CFDI Table", () => {
    it("should create invoice_related_cfdi table", () => {
      expect(migrationSQL).toContain(
        "CREATE TABLE IF NOT EXISTS invoice_related_cfdi"
      );
    });

    it("should have foreign key to invoices", () => {
      expect(migrationSQL).toMatch(
        /invoice_related_cfdi[\s\S]*invoice_id UUID NOT NULL REFERENCES invoices\(id\)/
      );
    });

    it("should have tipo_relacion column", () => {
      expect(migrationSQL).toContain("tipo_relacion VARCHAR(2) NOT NULL");
    });

    it("should have related_uuid column", () => {
      expect(migrationSQL).toContain("related_uuid VARCHAR(36) NOT NULL");
    });

    it("should have check constraint for valid tipo_relacion values", () => {
      expect(migrationSQL).toContain("check_tipo_relacion CHECK");
      // All valid SAT relationship type codes
      expect(migrationSQL).toMatch(
        /tipo_relacion IN \('01','02','03','04','05','06','07','08','09'\)/
      );
    });

    it("should have unique constraint on invoice_id + related_uuid", () => {
      expect(migrationSQL).toContain("idx_related_cfdi_unique");
      expect(migrationSQL).toContain(
        "ON invoice_related_cfdi(invoice_id, related_uuid)"
      );
    });
  });

  describe("Invoice Folio Sequences Table", () => {
    it("should create invoice_folio_sequences table", () => {
      expect(migrationSQL).toContain(
        "CREATE TABLE IF NOT EXISTS invoice_folio_sequences"
      );
    });

    it("should have organization_id foreign key", () => {
      expect(migrationSQL).toMatch(
        /invoice_folio_sequences[\s\S]*organization_id UUID NOT NULL REFERENCES organizations\(id\)/
      );
    });

    it("should have serie column with default empty string", () => {
      expect(migrationSQL).toMatch(
        /invoice_folio_sequences[\s\S]*serie VARCHAR\(25\) NOT NULL DEFAULT ''/
      );
    });

    it("should have next_folio column", () => {
      expect(migrationSQL).toMatch(
        /invoice_folio_sequences[\s\S]*next_folio INTEGER NOT NULL DEFAULT 1/
      );
    });

    it("should have unique constraint on organization_id + serie", () => {
      expect(migrationSQL).toContain(
        "CONSTRAINT unique_org_serie UNIQUE (organization_id, serie)"
      );
    });
  });

  describe("get_next_folio Function", () => {
    it("should create get_next_folio function", () => {
      expect(migrationSQL).toContain(
        "CREATE OR REPLACE FUNCTION get_next_folio"
      );
    });

    it("should accept org_id UUID and serie VARCHAR parameters", () => {
      expect(migrationSQL).toContain("p_org_id UUID");
      expect(migrationSQL).toContain("p_serie VARCHAR");
    });

    it("should return INTEGER", () => {
      expect(migrationSQL).toMatch(
        /get_next_folio\(p_org_id UUID, p_serie VARCHAR\)\s*RETURNS INTEGER/
      );
    });

    it("should use INSERT ON CONFLICT pattern for atomicity", () => {
      expect(migrationSQL).toContain(
        "INSERT INTO invoice_folio_sequences (organization_id, serie, next_folio)"
      );
      expect(migrationSQL).toContain("ON CONFLICT (organization_id, serie)");
      expect(migrationSQL).toContain("DO UPDATE SET");
      expect(migrationSQL).toContain(
        "next_folio = invoice_folio_sequences.next_folio + 1"
      );
    });

    it("should return folio - 1 (the current folio, not the next)", () => {
      expect(migrationSQL).toContain("RETURNING next_folio - 1 INTO v_folio");
      expect(migrationSQL).toContain("RETURN v_folio");
    });
  });

  describe("Row Level Security", () => {
    it("should enable RLS on invoice_related_cfdi", () => {
      expect(migrationSQL).toContain(
        "ALTER TABLE invoice_related_cfdi ENABLE ROW LEVEL SECURITY"
      );
    });

    it("should enable RLS on invoice_folio_sequences", () => {
      expect(migrationSQL).toContain(
        "ALTER TABLE invoice_folio_sequences ENABLE ROW LEVEL SECURITY"
      );
    });

    it("should create select policy for invoices", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "invoices_select" ON invoices FOR SELECT'
      );
    });

    it("should create insert policy for invoices with role check", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "invoices_insert" ON invoices FOR INSERT'
      );
      expect(migrationSQL).toContain(
        "role IN ('owner', 'admin', 'accountant')"
      );
    });

    it("should create update policy for invoices with role check", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "invoices_update" ON invoices FOR UPDATE'
      );
    });

    it("should create policies for invoice_items", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "invoice_items_select" ON invoice_items'
      );
      expect(migrationSQL).toContain(
        'CREATE POLICY "invoice_items_modify" ON invoice_items'
      );
    });

    it("should create policies for invoice_related_cfdi", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "related_cfdi_select" ON invoice_related_cfdi'
      );
      expect(migrationSQL).toContain(
        'CREATE POLICY "related_cfdi_modify" ON invoice_related_cfdi'
      );
    });

    it("should create policies for invoice_folio_sequences", () => {
      expect(migrationSQL).toContain(
        'CREATE POLICY "folio_sequences_select" ON invoice_folio_sequences'
      );
      expect(migrationSQL).toContain(
        'CREATE POLICY "folio_sequences_modify" ON invoice_folio_sequences'
      );
    });

    it("should use organization_members for RLS checks", () => {
      // Count occurrences of organization_members in RLS policies
      const matches = migrationSQL.match(/organization_members/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(5); // Multiple policies use it
    });

    it("should check deleted_at IS NULL in RLS policies", () => {
      const matches = migrationSQL.match(/deleted_at IS NULL/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(5);
    });
  });

  describe("Indexes", () => {
    it("should create folio lookup index", () => {
      expect(migrationSQL).toContain("idx_invoices_folio");
      expect(migrationSQL).toContain("organization_id, serie, folio_number_int");
    });

    it("should create issue_date index", () => {
      expect(migrationSQL).toContain("idx_invoices_issue_date");
    });

    it("should create tipo_comprobante index", () => {
      expect(migrationSQL).toContain("idx_invoices_tipo");
    });

    it("should create full-text search index", () => {
      expect(migrationSQL).toContain("idx_invoices_search");
      expect(migrationSQL).toContain("to_tsvector('spanish'");
    });

    it("should create indexes for related_cfdi", () => {
      expect(migrationSQL).toContain("idx_related_cfdi_invoice");
      expect(migrationSQL).toContain("idx_related_cfdi_unique");
    });

    it("should create index for folio_sequences", () => {
      expect(migrationSQL).toContain("idx_folio_sequences_org");
    });
  });

  describe("Invoice Status Values", () => {
    it("should add 'void' status to enum", () => {
      expect(migrationSQL).toContain("invoice_status ADD VALUE");
      expect(migrationSQL).toContain("'void'");
    });
  });

  describe("Triggers", () => {
    it("should create updated_at trigger for invoices", () => {
      expect(migrationSQL).toContain("trigger_invoices_updated_at");
      expect(migrationSQL).toContain("update_updated_at_column");
    });

    it("should create updated_at trigger for folio_sequences", () => {
      expect(migrationSQL).toContain("trigger_folio_sequences_updated_at");
    });
  });

  describe("Comments", () => {
    it("should add comments for CFDI-specific columns", () => {
      expect(migrationSQL).toContain("COMMENT ON COLUMN invoices.tipo_comprobante");
      expect(migrationSQL).toContain("COMMENT ON COLUMN invoices.exportacion");
      expect(migrationSQL).toContain("COMMENT ON COLUMN invoice_items.tax_object");
    });

    it("should add comments for tables and functions", () => {
      expect(migrationSQL).toContain("COMMENT ON TABLE invoice_related_cfdi");
      expect(migrationSQL).toContain("COMMENT ON TABLE invoice_folio_sequences");
      expect(migrationSQL).toContain("COMMENT ON FUNCTION get_next_folio");
    });
  });
});

describe("SQL Syntax Validation", () => {
  it("should have balanced parentheses", () => {
    const openParens = (migrationSQL.match(/\(/g) || []).length;
    const closeParens = (migrationSQL.match(/\)/g) || []).length;
    expect(openParens).toBe(closeParens);
  });

  it("should have balanced single quotes", () => {
    // Count single quotes, excluding escaped ones
    const quotes = migrationSQL.replace(/''/g, "").match(/'/g) || [];
    expect(quotes.length % 2).toBe(0);
  });

  it("should have balanced dollar quotes", () => {
    const dollarQuotes = migrationSQL.match(/\$\$/g) || [];
    expect(dollarQuotes.length % 2).toBe(0);
  });

  it("should not have common SQL syntax errors", () => {
    // Check for common mistakes
    expect(migrationSQL).not.toMatch(/,\s*\)/); // No trailing commas before closing paren
    expect(migrationSQL).not.toMatch(/\(\s*,/); // No leading commas after opening paren
  });

  it("should use IF NOT EXISTS for idempotent table creation", () => {
    expect(migrationSQL).toContain("CREATE TABLE IF NOT EXISTS invoice_related_cfdi");
    expect(migrationSQL).toContain("CREATE TABLE IF NOT EXISTS invoice_folio_sequences");
  });

  it("should use CREATE INDEX IF NOT EXISTS for idempotent index creation", () => {
    const createIndexCount = (migrationSQL.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    expect(createIndexCount).toBeGreaterThan(0);
  });
});
