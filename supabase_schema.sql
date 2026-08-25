-- ============================================
-- GESTOR DE FACTURACIÓN proDUCKtive
-- Esquema completo (tablas fac_*)
-- ============================================

-- Configuración de la empresa emisora (solo 1 fila, id=1)
CREATE TABLE IF NOT EXISTS fac_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre TEXT DEFAULT 'proDUCKtive',
  nit TEXT DEFAULT '',
  nrc TEXT DEFAULT '',
  giro_primario TEXT DEFAULT 'M7490 - Otras actividades profesionales, cientificas y tecnicas',
  direccion TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT 'producktive.sv@hotmail.com',
  logo_url TEXT DEFAULT '',
  regimen TEXT DEFAULT 'General',
  modo_dte TEXT DEFAULT 'proforma',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes
CREATE TABLE IF NOT EXISTS fac_clientes (
  id SERIAL PRIMARY KEY,
  nit TEXT UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  giro TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de productos / servicios
CREATE TABLE IF NOT EXISTS fac_productos (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio NUMERIC(12,2) DEFAULT 0,
  impuesto TEXT DEFAULT 'IVA13',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facturas emitidas
CREATE TABLE IF NOT EXISTS fac_facturas (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('PROFORMA','FCF','CCF','NC','ND','FEX','FSE','TCF')),
  numero TEXT NOT NULL,
  numero_control TEXT,
  sello_recepcion TEXT,
  fecha_emision DATE NOT NULL,
  cliente_id INTEGER REFERENCES fac_clientes(id),
  nit_cliente TEXT,
  nombre_cliente TEXT,
  email_cliente TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  iva NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  estado TEXT DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA','ANULADA','PROFORMA')),
  observaciones TEXT,
  pdf_url TEXT,
  xml_url TEXT,
  hash_pdf TEXT,
  hash_xml TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facturas recibidas (compras con CCF / FSE)
CREATE TABLE IF NOT EXISTS fac_recibidas (
  id SERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'CCF',
  numero TEXT,
  numero_control TEXT,
  fecha_emision DATE NOT NULL,
  proveedor TEXT NOT NULL,
  nit_proveedor TEXT,
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  iva NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  pdf_url TEXT,
  xml_url TEXT,
  hash_pdf TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auditoría (seguridad: trazabilidad de acciones)
CREATE TABLE IF NOT EXISTS fac_auditoria (
  id SERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  tabla TEXT,
  id_registro INTEGER,
  detalle JSONB,
  creado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Numeración correlativa por tipo de documento
CREATE TABLE IF NOT EXISTS fac_serie (
  tipo TEXT PRIMARY KEY,
  correlativo INTEGER DEFAULT 0,
  formato TEXT DEFAULT '{TIPO}-{ANIO}-{NUM:6}'
);

INSERT INTO fac_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============ SEGURIDAD (RLS) ============
-- Solo usuarios autenticados del proyecto pueden ver/escribir
ALTER TABLE fac_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_recibidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE fac_serie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fac_all_auth" ON fac_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_facturas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_recibidas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_auditoria FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fac_all_auth" ON fac_serie FOR ALL TO authenticated USING (true) WITH CHECK (true);
