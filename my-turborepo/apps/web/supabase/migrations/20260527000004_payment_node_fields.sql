-- ============================================
-- FIX-2.1: Add missing payment-node fields for Anexo 24 Cheque/Transferencia
-- ============================================

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_beneficiary VARCHAR(300),
  ADD COLUMN IF NOT EXISTS payment_beneficiary_rfc VARCHAR(13),
  ADD COLUMN IF NOT EXISTS dest_bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dest_bank_code VARCHAR(10);

COMMENT ON COLUMN journal_entry_lines.payment_date IS 'Fecha del movimiento de pago (Cheque/Transferencia). Defaults to entry_date in app.';
COMMENT ON COLUMN journal_entry_lines.payment_beneficiary IS 'Anexo 24 Benef attribute on Cheque/Transferencia.';
COMMENT ON COLUMN journal_entry_lines.payment_beneficiary_rfc IS 'Anexo 24 RFC attribute on Cheque/Transferencia.';
COMMENT ON COLUMN journal_entry_lines.dest_bank_account IS 'Anexo 24 CtaDest for transferencias.';
COMMENT ON COLUMN journal_entry_lines.dest_bank_code IS 'Anexo 24 BancoDestNal for transferencias.';
