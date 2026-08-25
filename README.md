# 🐤 Gestor de Facturación proDUCKtive

Sistema web de facturación para el universo proDUCKtive (A1 Baratuss · A2 Cindy Rubio Artista · A3).

## URL
https://producktive-sv.github.io/facturas/

## Funcionalidades
- 🔐 Login con correo (Supabase Auth) — solo personal autorizado
- 📋 Facturas emitidas (PROFORMA/FCF/CCF/NC/ND/FSE) con buscador por año, mes, día, tipo, estado, cliente y montos
- 🧾 Generador de documentos: clientes del registro, items, cálculo automático de IVA, numeración correlativa, PDF imprimible
- 👥 Registro de clientes (re-facturación con datos guardados)
- 📥 Facturas recibidas (compras CCF — crédito fiscal)
- 🔍 Exportación CSV / JSON
- 🛡️ Auditoría de acciones + RLS (permisos por fila)
- 📦 Backup automático mensual a Google Drive (10 años de conservación)

## Modo de emisión
- **PROFORMA**: sin NRC — los documentos no tienen valor tributario (cotización/prefactura)
- **DTE**: al registrar el NRC en Config → emisión oficial de facturación electrónica (requiere NRC + Firma Electrónica FIEL)

## Stack
- Frontend: HTML/CSS/JS vanilla en GitHub Pages
- Backend: Supabase (Postgres + Auth + Storage)
- Tablas: `fac_config`, `fac_clientes`, `fac_productos`, `fac_facturas`, `fac_recibidas`, `fac_auditoria`, `fac_serie`

## Despliegue
```bash
git add -A && git commit -m "..." && git push
```
GitHub Pages publica automáticamente (rama main, /root).
