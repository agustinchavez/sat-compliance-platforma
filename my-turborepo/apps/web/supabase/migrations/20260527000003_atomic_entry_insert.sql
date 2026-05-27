-- ============================================
-- FIX-1.4: Transactional journal entry insertion via RPC
-- ============================================
-- Combines entry number allocation, header insert, and lines insert
-- into one atomic function. No orphaned headers on partial failure.

CREATE OR REPLACE FUNCTION insert_journal_entry_atomic(
  p_organization_id UUID,
  p_entry_data JSONB,
  p_lines JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
  v_entry_number TEXT;
  v_year SMALLINT;
  v_entry_row JSONB;
  v_total_debit NUMERIC(18,2);
  v_total_credit NUMERIC(18,2);
BEGIN
  -- Permission check
  IF NOT auth_user_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Permission denied: not a member of organization %', p_organization_id;
  END IF;

  -- Compute totals from lines (defense-in-depth: don't trust caller)
  SELECT
    COALESCE(SUM((line->>'debit')::NUMERIC), 0),
    COALESCE(SUM((line->>'credit')::NUMERIC), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_lines) AS line;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Unbalanced entry: debit=%, credit=%', v_total_debit, v_total_credit;
  END IF;

  -- Allocate entry number atomically
  v_year := EXTRACT(YEAR FROM (p_entry_data->>'entry_date')::DATE)::SMALLINT;
  v_entry_number := next_journal_entry_number(p_organization_id, v_year);

  -- Insert header
  INSERT INTO journal_entries (
    organization_id, entry_number, fiscal_period_id, entry_date,
    poliza_type, description, status,
    source_type, source_id, source_uuid_cfdi,
    currency_code, exchange_rate,
    total_debit, total_credit,
    created_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    (p_entry_data->>'fiscal_period_id')::UUID,
    (p_entry_data->>'entry_date')::DATE,
    p_entry_data->>'poliza_type',
    p_entry_data->>'description',
    COALESCE(p_entry_data->>'status', 'draft'),
    NULLIF(p_entry_data->>'source_type', ''),
    NULLIF(p_entry_data->>'source_id', '')::UUID,
    NULLIF(p_entry_data->>'source_uuid_cfdi', ''),
    COALESCE(p_entry_data->>'currency_code', 'MXN'),
    COALESCE((p_entry_data->>'exchange_rate')::NUMERIC, 1.0),
    v_total_debit,
    v_total_credit,
    (p_entry_data->>'created_by')::UUID
  ) RETURNING id INTO v_entry_id;

  -- Insert lines
  INSERT INTO journal_entry_lines (
    organization_id, journal_entry_id, line_number,
    account_id, account_code, debit, credit, description,
    uuid_cfdi, rfc_third_party, monto_total_comp, moneda_comp, tipo_cambio_comp,
    payment_method, bank_account, bank_code, payment_reference,
    third_party_id, third_party_type
  )
  SELECT
    p_organization_id,
    v_entry_id,
    (line->>'line_number')::SMALLINT,
    (line->>'account_id')::UUID,
    line->>'account_code',
    COALESCE((line->>'debit')::NUMERIC, 0),
    COALESCE((line->>'credit')::NUMERIC, 0),
    line->>'description',
    NULLIF(line->>'uuid_cfdi', ''),
    NULLIF(line->>'rfc_third_party', ''),
    NULLIF((line->>'monto_total_comp')::TEXT, '')::NUMERIC,
    NULLIF(line->>'moneda_comp', ''),
    NULLIF((line->>'tipo_cambio_comp')::TEXT, '')::NUMERIC,
    NULLIF(line->>'payment_method', ''),
    NULLIF(line->>'bank_account', ''),
    NULLIF(line->>'bank_code', ''),
    NULLIF(line->>'payment_reference', ''),
    NULLIF(line->>'third_party_id', '')::UUID,
    NULLIF(line->>'third_party_type', '')
  FROM jsonb_array_elements(p_lines) AS line;

  -- Return the complete entry with lines as JSONB
  SELECT jsonb_build_object(
    'entry', to_jsonb(je.*),
    'lines', COALESCE(jsonb_agg(to_jsonb(jel.*) ORDER BY jel.line_number), '[]'::jsonb)
  ) INTO v_entry_row
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.id = v_entry_id
  GROUP BY je.id;

  RETURN v_entry_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_journal_entry_atomic(UUID, JSONB, JSONB) TO authenticated;
