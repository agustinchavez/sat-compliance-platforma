# Guía de CFDI 4.0 / CFDI 4.0 Guide

Este documento cubre todo sobre la facturación electrónica en México.
This document covers everything about electronic invoicing in Mexico.

---

## ¿Qué es CFDI? / What is CFDI?

CFDI significa **Comprobante Fiscal Digital por Internet**. Es el formato obligatorio de factura electrónica en México desde 2014, regulado por el SAT.

**CFDI 4.0** es la versión actual (vigente desde enero 2022, obligatorio desde abril 2023). Incluye:
- Validación del RFC y nombre del receptor con el SAT
- Código postal del domicilio fiscal
- Régimen fiscal del emisor y receptor
- Exportación de mercancías (campo obligatorio)

CFDI stands for **Comprobante Fiscal Digital por Internet** (Digital Tax Receipt via Internet). It is Mexico's mandatory electronic invoice format since 2014.

---

## Tipos de CFDI / Types of CFDI

### Ingreso (I)
- Para ventas, cobro de servicios, anticipos
- El tipo más común de factura
- Debe incluir método y forma de pago

### Egreso (E)
- Notas de crédito, devoluciones, descuentos
- Se relaciona con un CFDI de Ingreso previo
- Reduce el ingreso acumulable

### Traslado (T)
- Para movimiento de mercancías sin venta
- No tiene efectos fiscales de ingreso
- Requerido para transporte de mercancías propias

### Nómina (N)
- Comprobante de pago de salarios
- Complemento de nómina obligatorio
- Detalla percepciones, deducciones, ISR retenido

### Pago (P)
- Complemento de Recepción de Pagos
- Se usa cuando el método de pago es PPD (Pago en Parcialidades o Diferido)
- Documenta cada pago recibido

---

## Campos Obligatorios CFDI 4.0 / Required Fields

### Del Emisor:
- RFC (13 caracteres para personas morales, 12 para físicas)
- Nombre o razón social (debe coincidir exactamente con SAT)
- Régimen fiscal (catálogo SAT)
- Domicilio fiscal (código postal)

### Del Receptor:
- RFC (validado en tiempo real con SAT)
- Nombre (debe coincidir con registro SAT)
- Régimen fiscal
- Domicilio fiscal (código postal)
- Uso del CFDI (catálogo SAT, ej: G03 - Gastos en general)

### De la Operación:
- Fecha y hora de emisión
- Lugar de expedición (código postal)
- Forma de pago (01=Efectivo, 03=Transferencia, etc.)
- Método de pago (PUE o PPD)
- Conceptos con clave de producto/servicio SAT

---

## Complemento de Pago / Payment Complement

### ¿Cuándo es obligatorio?

El complemento de pago es obligatorio cuando:
1. El método de pago es **PPD** (Pago en Parcialidades o Diferido)
2. No se paga la totalidad en el momento de la operación

### ¿Cómo funciona?

1. Emites factura con método de pago PPD
2. Cuando recibes un pago, emites un CFDI tipo "P" (Pago)
3. El CFDI de Pago relaciona el pago con la factura original
4. Puedes emitir múltiples complementos de pago para pagos parciales

**Plazo:** El complemento de pago debe emitirse a más tardar el día 10 del mes siguiente al que se recibió el pago.

---

## CFDI Global / Global Invoice

### ¿Qué es?

Es un CFDI que ampara múltiples operaciones con público en general (sin RFC del comprador).

### ¿Cuándo se usa?

- Ventas a consumidor final sin solicitud de factura
- Se emite de forma diaria, semanal o mensual
- RFC genérico: **XAXX010101000**
- Nombre: "PUBLICO EN GENERAL"
- Régimen fiscal: 616 (Sin obligaciones fiscales)
- Uso CFDI: S01 (Sin efectos fiscales)

### Límites y requisitos:
- Cada operación individual no debe exceder $2,000 MXN
- Debe desglosar los conceptos o usar el complemento "Global"

---

## Cancelación de CFDI / CFDI Cancellation

### Motivos de cancelación (Catálogo SAT):

| Código | Motivo |
|--------|--------|
| 01 | Comprobante emitido con errores con relación |
| 02 | Comprobante emitido con errores sin relación |
| 03 | No se llevó a cabo la operación |
| 04 | Operación nominativa relacionada en factura global |

### Proceso de cancelación:

1. **Sin aceptación del receptor** (se cancela inmediatamente):
   - CFDI con total ≤ $1,000 MXN
   - CFDI de nómina
   - CFDI de egreso relacionado
   - CFDI emitido a RFC genérico (XAXX010101000)
   - Cancelación en el mismo mes de emisión

2. **Con aceptación del receptor**:
   - El receptor tiene 3 días hábiles para aceptar o rechazar
   - Si no responde, se cancela automáticamente
   - El receptor puede rechazar indefinidamente

### Plazos:
- Facturas emitidas en 2024: Pueden cancelarse hasta el 31 de marzo 2025
- En general: hasta el último día para presentar declaración anual del ejercicio

---

## Errores Comunes y Soluciones / Common Errors

### Error: "RFC del receptor no válido"
- **Causa**: El RFC no existe en el padrón del SAT
- **Solución**: Verificar RFC en la Constancia de Situación Fiscal del cliente

### Error: "Nombre no coincide con registro SAT"
- **Causa**: El nombre debe ser EXACTO al registrado
- **Solución**: Solicitar Constancia de Situación Fiscal actualizada

### Error: "Régimen fiscal no válido para el receptor"
- **Causa**: El régimen indicado no corresponde al receptor
- **Solución**: Verificar régimen fiscal en constancia del SAT

### Error: "Uso de CFDI no aplica para régimen fiscal"
- **Causa**: Combinación inválida de régimen + uso CFDI
- **Solución**: Consultar catálogo de usos permitidos por régimen

*Nota: Esta información es de carácter general. Consulta a un Contador Público Certificado (CPC) para tu situación específica.*
