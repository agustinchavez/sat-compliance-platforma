-- ============================================================================
-- Product/Service Management Tables
-- ============================================================================
-- This migration creates tables for product/service catalog management:
-- 1. products: Main product/service catalog
-- 2. inventory_history: Track stock adjustments
-- 3. sat_product_codes: SAT ClaveProdServ catalog (55,000+ codes)
-- 4. sat_unit_codes: SAT ClaveUnidad catalog (2,800+ codes)
--
-- Author: Claude Code
-- Date: 2025-11-25
-- ============================================================================

-- ============================================================================
-- Table: products
-- Purpose: Store organization's product and service catalog
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (type IN ('product', 'service')),
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(50),

  -- SAT Codes (Required for CFDI)
  sat_product_code VARCHAR(8) NOT NULL,
  sat_product_name VARCHAR(500),
  sat_unit_code VARCHAR(10) NOT NULL,
  sat_unit_name VARCHAR(255),
  unit_name VARCHAR(50) NOT NULL,

  -- Pricing
  price DECIMAL(15, 4) NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',

  -- Tax Configuration
  tax_object VARCHAR(2) NOT NULL DEFAULT '02' CHECK (tax_object IN ('01', '02', '03')),
  iva_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.16 CHECK (iva_rate IN (0, 0.08, 0.16)),
  iva_exempt BOOLEAN NOT NULL DEFAULT false,
  iva_retention BOOLEAN NOT NULL DEFAULT false,
  iva_retention_rate DECIMAL(6, 4) CHECK (iva_retention_rate >= 0 AND iva_retention_rate <= 1),
  isr_retention BOOLEAN NOT NULL DEFAULT false,
  isr_retention_rate DECIMAL(6, 4) CHECK (isr_retention_rate >= 0 AND isr_retention_rate <= 1),

  -- Inventory
  track_inventory BOOLEAN NOT NULL DEFAULT false,
  current_stock DECIMAL(15, 4) NOT NULL DEFAULT 0,
  min_stock DECIMAL(15, 4),
  max_stock DECIMAL(15, 4),

  -- Categorization
  category VARCHAR(100),
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT check_retention_rates CHECK (
    (NOT iva_retention OR iva_retention_rate IS NOT NULL) AND
    (NOT isr_retention OR isr_retention_rate IS NOT NULL)
  ),
  CONSTRAINT check_stock_levels CHECK (
    (min_stock IS NULL OR max_stock IS NULL OR min_stock <= max_stock)
  )
);

-- Unique SKU per organization (excluding deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_sku
  ON products(organization_id, sku)
  WHERE deleted_at IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_sat_code ON products(sat_product_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, organization_id) WHERE category IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING gin(tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at DESC) WHERE deleted_at IS NULL;

-- Low stock alert index
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(organization_id, current_stock, min_stock)
  WHERE track_inventory = true AND deleted_at IS NULL;

-- Full-text search index (Spanish)
CREATE INDEX IF NOT EXISTS idx_products_search ON products
  USING gin(to_tsvector('spanish', name || ' ' || COALESCE(description, '') || ' ' || sku))
  WHERE deleted_at IS NULL;

-- Comments
COMMENT ON TABLE products IS 'Product and service catalog for CFDI invoice generation';
COMMENT ON COLUMN products.sat_product_code IS 'SAT ClaveProdServ code (required for CFDI)';
COMMENT ON COLUMN products.sat_unit_code IS 'SAT ClaveUnidad code (required for CFDI)';
COMMENT ON COLUMN products.tax_object IS '01=No objeto, 02=Sí objeto, 03=Sí objeto parcial';
COMMENT ON COLUMN products.iva_rate IS 'IVA rate: 0, 0.08, or 0.16';
COMMENT ON COLUMN products.iva_retention_rate IS 'IVA retention rate (typically 0.1067 for services)';
COMMENT ON COLUMN products.isr_retention_rate IS 'ISR retention rate (typically 0.10 for services)';

-- ============================================================================
-- Table: inventory_history
-- Purpose: Track all inventory adjustments for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Adjustment details
  quantity DECIMAL(15, 4) NOT NULL,
  previous_stock DECIMAL(15, 4) NOT NULL,
  new_stock DECIMAL(15, 4) NOT NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN (
    'purchase', 'sale', 'return', 'adjustment',
    'damaged', 'expired', 'transfer', 'initial'
  )),
  reference VARCHAR(255),
  notes TEXT,
  cost_per_unit DECIMAL(15, 4),

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_history_product ON inventory_history(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_history_org ON inventory_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_history_date ON inventory_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_history_reason ON inventory_history(reason);
CREATE INDEX IF NOT EXISTS idx_inventory_history_reference ON inventory_history(reference) WHERE reference IS NOT NULL;

-- Comments
COMMENT ON TABLE inventory_history IS 'Audit trail for all inventory adjustments';
COMMENT ON COLUMN inventory_history.reason IS 'Reason for adjustment: purchase, sale, return, adjustment, damaged, expired, transfer, initial';
COMMENT ON COLUMN inventory_history.reference IS 'Reference document (invoice ID, PO number, etc.)';

-- ============================================================================
-- Table: sat_product_codes
-- Purpose: SAT ClaveProdServ catalog for product/service codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS sat_product_codes (
  code VARCHAR(8) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  division VARCHAR(2),
  "group" VARCHAR(4),
  class VARCHAR(6),

  -- Full-text search vector (auto-generated)
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish', name || ' ' || COALESCE(description, ''))
  ) STORED
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_search ON sat_product_codes USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_division ON sat_product_codes(division);
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_group ON sat_product_codes("group");
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_class ON sat_product_codes(class);
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_name ON sat_product_codes(name);

-- Comments
COMMENT ON TABLE sat_product_codes IS 'SAT ClaveProdServ catalog (55,000+ product/service codes)';
COMMENT ON COLUMN sat_product_codes.code IS '8-digit SAT product/service code';
COMMENT ON COLUMN sat_product_codes.division IS 'First 2 digits - Division level';
COMMENT ON COLUMN sat_product_codes."group" IS 'First 4 digits - Group level';
COMMENT ON COLUMN sat_product_codes.class IS 'First 6 digits - Class level';

-- ============================================================================
-- Table: sat_unit_codes
-- Purpose: SAT ClaveUnidad catalog for unit of measure codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS sat_unit_codes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  symbol VARCHAR(20)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sat_unit_codes_name ON sat_unit_codes(name);
CREATE INDEX IF NOT EXISTS idx_sat_unit_codes_search ON sat_unit_codes
  USING gin(to_tsvector('spanish', name || ' ' || COALESCE(description, '')));

-- Comments
COMMENT ON TABLE sat_unit_codes IS 'SAT ClaveUnidad catalog (2,800+ unit codes)';
COMMENT ON COLUMN sat_unit_codes.code IS 'SAT unit code (e.g., H87, E48, KGM)';
COMMENT ON COLUMN sat_unit_codes.symbol IS 'Unit symbol (e.g., pza, kg, m)';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_history ENABLE ROW LEVEL SECURITY;

-- Products: Users can view products from their organizations
DROP POLICY IF EXISTS "Users can view products for their organizations" ON products;
CREATE POLICY "Users can view products for their organizations"
  ON products
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Products: Accountants+ can create products
DROP POLICY IF EXISTS "Accountants can create products" ON products;
CREATE POLICY "Accountants can create products"
  ON products
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
  );

-- Products: Accountants+ can update products
DROP POLICY IF EXISTS "Accountants can update products" ON products;
CREATE POLICY "Accountants can update products"
  ON products
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Products: Admins+ can delete products
DROP POLICY IF EXISTS "Admins can delete products" ON products;
CREATE POLICY "Admins can delete products"
  ON products
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "Service role can manage products" ON products;
CREATE POLICY "Service role can manage products"
  ON products
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Inventory History: Users can view inventory history for their organizations
DROP POLICY IF EXISTS "Users can view inventory_history for their organizations" ON inventory_history;
CREATE POLICY "Users can view inventory_history for their organizations"
  ON inventory_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );

-- Inventory History: Accountants+ can insert inventory history
DROP POLICY IF EXISTS "Accountants can insert inventory_history" ON inventory_history;
CREATE POLICY "Accountants can insert inventory_history"
  ON inventory_history
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
  );

-- Service role bypass for inventory
DROP POLICY IF EXISTS "Service role can manage inventory_history" ON inventory_history;
CREATE POLICY "Service role can manage inventory_history"
  ON inventory_history
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- SAT catalogs are public (read-only)
-- No RLS needed - these are reference data

-- ============================================================================
-- Insert Common SAT Unit Codes
-- ============================================================================

INSERT INTO sat_unit_codes (code, name, description, symbol) VALUES
  ('H87', 'Pieza', 'Unidad de conteo', 'pza'),
  ('E48', 'Unidad de servicio', 'Unidad para servicios', 'srv'),
  ('ACT', 'Actividad', 'Unidad de actividad', 'act'),
  ('KGM', 'Kilogramo', 'Unidad de masa', 'kg'),
  ('GRM', 'Gramo', 'Unidad de masa', 'g'),
  ('LTR', 'Litro', 'Unidad de volumen', 'L'),
  ('MLT', 'Mililitro', 'Unidad de volumen', 'mL'),
  ('MTR', 'Metro', 'Unidad de longitud', 'm'),
  ('CMT', 'Centímetro', 'Unidad de longitud', 'cm'),
  ('MTK', 'Metro cuadrado', 'Unidad de área', 'm²'),
  ('MTQ', 'Metro cúbico', 'Unidad de volumen', 'm³'),
  ('XBX', 'Caja', 'Contenedor tipo caja', 'caja'),
  ('XPK', 'Paquete', 'Contenedor tipo paquete', 'paq'),
  ('XUN', 'Unidad', 'Unidad genérica', 'u'),
  ('HUR', 'Hora', 'Unidad de tiempo', 'h'),
  ('DAY', 'Día', 'Unidad de tiempo', 'd'),
  ('MON', 'Mes', 'Unidad de tiempo', 'mes'),
  ('ANN', 'Año', 'Unidad de tiempo', 'año'),
  ('SET', 'Conjunto', 'Grupo de artículos', 'set'),
  ('PR', 'Par', 'Dos unidades', 'par'),
  ('DZN', 'Docena', 'Doce unidades', 'doc'),
  ('GLL', 'Galón', 'Unidad de volumen', 'gal'),
  ('TNE', 'Tonelada métrica', 'Unidad de masa', 't'),
  ('KWH', 'Kilovatio hora', 'Unidad de energía', 'kWh'),
  ('EA', 'Elemento', 'Cada uno', 'ea')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Insert Common SAT Product Codes
-- ============================================================================

INSERT INTO sat_product_codes (code, name, description, division, "group", class) VALUES
  ('01010101', 'No existe en el catálogo', 'Código genérico cuando no existe código específico', '01', '0101', '010101'),
  ('80101500', 'Servicios de consultoría de negocios', 'Asesoría y consultoría empresarial', '80', '8010', '801015'),
  ('80101501', 'Servicios de asesoría de negocios', 'Asesoría empresarial general', '80', '8010', '801015'),
  ('80101502', 'Servicios de planificación estratégica', 'Planificación de negocios', '80', '8010', '801015'),
  ('80101503', 'Servicios de estudios de mercado', 'Investigación de mercados', '80', '8010', '801015'),
  ('80101504', 'Servicios de análisis de negocios', 'Análisis empresarial', '80', '8010', '801015'),
  ('80101505', 'Servicios de desarrollo organizacional', 'Desarrollo de organizaciones', '80', '8010', '801015'),
  ('80101506', 'Servicios de mejora de procesos', 'Optimización de procesos', '80', '8010', '801015'),
  ('80111600', 'Servicios de personal temporal', 'Servicios de outsourcing de personal', '80', '8011', '801116'),
  ('81112100', 'Servicios de consultoría de negocios y corporativa', 'Consultoría empresarial especializada', '81', '8111', '811121'),
  ('84111500', 'Servicios de contabilidad', 'Servicios contables y financieros', '84', '8411', '841115'),
  ('84111501', 'Servicios de contabilidad financiera', 'Contabilidad general', '84', '8411', '841115'),
  ('84111502', 'Servicios de preparación de impuestos', 'Elaboración de declaraciones fiscales', '84', '8411', '841115'),
  ('84111503', 'Servicios de contabilidad de costos', 'Contabilidad de costos', '84', '8411', '841115'),
  ('84111504', 'Servicios de teneduría de libros', 'Registro contable', '84', '8411', '841115'),
  ('84111505', 'Servicios de nóminas', 'Administración de nóminas', '84', '8411', '841115'),
  ('84111506', 'Servicios de facturación', 'Servicios de facturación', '84', '8411', '841115'),
  ('84111600', 'Servicios de auditoría', 'Servicios de auditoría contable', '84', '8411', '841116'),
  ('84111601', 'Servicios de auditoría financiera', 'Auditoría de estados financieros', '84', '8411', '841116'),
  ('84111602', 'Servicios de auditoría operativa', 'Auditoría de operaciones', '84', '8411', '841116'),
  ('43211503', 'Computadoras portátiles', 'Laptops y notebooks', '43', '4321', '432115'),
  ('43211507', 'Computadoras de escritorio', 'Computadoras desktop', '43', '4321', '432115'),
  ('43211508', 'Estaciones de trabajo', 'Workstations', '43', '4321', '432115'),
  ('43211509', 'Servidores de computador', 'Servidores', '43', '4321', '432115'),
  ('43211500', 'Computadoras', 'Equipos de cómputo general', '43', '4321', '432115'),
  ('43212100', 'Software funcional específico de la industria', 'Software especializado', '43', '4321', '432121'),
  ('43231500', 'Software de aplicaciones', 'Software de aplicaciones', '43', '4323', '432315'),
  ('44121600', 'Suministros de oficina', 'Artículos de oficina', '44', '4412', '441216'),
  ('44121700', 'Instrumentos de escritura', 'Plumas, lápices, etc.', '44', '4412', '441217'),
  ('44121800', 'Dispositivos de corrección', 'Correctores', '44', '4412', '441218'),
  ('44121900', 'Accesorios de escritorio', 'Organizadores y accesorios', '44', '4412', '441219'),
  ('78101800', 'Servicios de transporte de pasajeros', 'Transporte de personas', '78', '7810', '781018'),
  ('78101801', 'Servicios de transporte aéreo de pasajeros', 'Vuelos comerciales', '78', '7810', '781018'),
  ('78101802', 'Servicios de transporte terrestre de pasajeros', 'Autobús, taxi, etc.', '78', '7810', '781018'),
  ('78101803', 'Servicios de transporte ferroviario de pasajeros', 'Trenes de pasajeros', '78', '7810', '781018'),
  ('78101804', 'Servicios de transporte marítimo de pasajeros', 'Barcos de pasajeros', '78', '7810', '781018'),
  ('78111800', 'Servicios de transporte de carga', 'Transporte de mercancías', '78', '7811', '781118'),
  ('90101500', 'Restaurantes y catering', 'Servicios de alimentos', '90', '9010', '901015'),
  ('90101501', 'Servicios de restaurante', 'Comida en restaurante', '90', '9010', '901015'),
  ('90101502', 'Servicios de catering', 'Servicio de banquetes', '90', '9010', '901015'),
  ('90101503', 'Servicios de cafetería', 'Servicio de cafetería', '90', '9010', '901015'),
  ('90111600', 'Servicios de alojamiento', 'Hospedaje y hoteles', '90', '9011', '901116'),
  ('90111601', 'Servicios de hotel', 'Hospedaje en hotel', '90', '9011', '901116'),
  ('90111602', 'Servicios de motel', 'Hospedaje en motel', '90', '9011', '901116'),
  ('80141600', 'Actividades de ventas y promoción de negocios', 'Servicios de marketing', '80', '8014', '801416'),
  ('80141601', 'Servicios de publicidad', 'Publicidad y promoción', '80', '8014', '801416'),
  ('80141602', 'Servicios de mercadotecnia', 'Marketing y ventas', '80', '8014', '801416'),
  ('80141603', 'Servicios de relaciones públicas', 'PR y comunicación', '80', '8014', '801416'),
  ('82101500', 'Publicidad impresa', 'Materiales impresos', '82', '8210', '821015'),
  ('82101600', 'Publicidad difundida', 'Publicidad en medios', '82', '8210', '821016'),
  ('82101700', 'Publicidad aérea', 'Publicidad en exteriores', '82', '8210', '821017'),
  ('82111700', 'Servicios de diseño gráfico', 'Diseño visual', '82', '8211', '821117'),
  ('82111800', 'Servicios de diseño de interiores', 'Diseño de espacios', '82', '8211', '821118'),
  ('82121500', 'Fotografía', 'Servicios fotográficos', '82', '8212', '821215'),
  ('82121600', 'Cinematografía', 'Producción de video', '82', '8212', '821216'),
  ('81161700', 'Servicios de desarrollo de software', 'Desarrollo de sistemas', '81', '8116', '811617'),
  ('81111500', 'Ingeniería de software o hardware', 'Desarrollo tecnológico', '81', '8111', '811115'),
  ('81111600', 'Programadores de computador', 'Servicios de programación', '81', '8111', '811116'),
  ('81111700', 'Servicios de sistemas y administración de componentes', 'Administración de sistemas', '81', '8111', '811117'),
  ('81111800', 'Servicios de redes', 'Redes e infraestructura', '81', '8111', '811118'),
  ('81111900', 'Servicios de internet', 'Servicios web', '81', '8111', '811119'),
  ('81112000', 'Servicios de datos', 'Manejo de datos', '81', '8111', '811120'),
  ('95121500', 'Clubes', 'Membresías y clubes', '95', '9512', '951215'),
  ('95121600', 'Parques de diversiones y acuáticos', 'Entretenimiento', '95', '9512', '951216'),
  ('72101500', 'Servicios de apoyo para la construcción', 'Construcción general', '72', '7210', '721015'),
  ('72102900', 'Servicios de mantenimiento y reparación de instalaciones', 'Mantenimiento', '72', '7210', '721029'),
  ('72151200', 'Servicios de plomería', 'Instalaciones sanitarias', '72', '7215', '721512'),
  ('72151500', 'Servicios eléctricos', 'Instalaciones eléctricas', '72', '7215', '721515'),
  ('76111500', 'Servicios de limpieza de edificios', 'Limpieza comercial', '76', '7611', '761115'),
  ('76111600', 'Servicios de desinfección', 'Sanitización', '76', '7611', '761116'),
  ('76121900', 'Servicios de jardinería', 'Mantenimiento de jardines', '76', '7612', '761219')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Statistics View
-- ============================================================================

CREATE OR REPLACE VIEW product_statistics AS
SELECT
  p.organization_id,
  COUNT(*) as total_products,
  COUNT(CASE WHEN p.type = 'product' THEN 1 END) as product_count,
  COUNT(CASE WHEN p.type = 'service' THEN 1 END) as service_count,
  COUNT(CASE WHEN p.is_active THEN 1 END) as active_count,
  COUNT(CASE WHEN NOT p.is_active THEN 1 END) as inactive_count,
  COUNT(CASE WHEN p.track_inventory THEN 1 END) as inventory_tracked_count,
  COUNT(CASE WHEN p.track_inventory AND p.current_stock <= COALESCE(p.min_stock, 0) THEN 1 END) as low_stock_count,
  AVG(p.price) as average_price,
  MAX(p.price) as max_price,
  MIN(p.price) as min_price
FROM products p
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id;

COMMENT ON VIEW product_statistics IS 'Summary statistics for products by organization';

-- Grant access to authenticated users
GRANT SELECT ON product_statistics TO authenticated;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE 'Products tables created successfully';
  RAISE NOTICE '- products table with RLS policies';
  RAISE NOTICE '- inventory_history table with RLS policies';
  RAISE NOTICE '- sat_product_codes table (seeded with common codes)';
  RAISE NOTICE '- sat_unit_codes table (seeded with common codes)';
  RAISE NOTICE '- product_statistics view';
  RAISE NOTICE '================================';
END $$;
