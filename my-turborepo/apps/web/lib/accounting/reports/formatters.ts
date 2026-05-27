/**
 * Financial Report Formatters (Component 23)
 *
 * Number formatting, hierarchy display, currency formatting.
 */

/**
 * Formats a number as Mexican currency (MXN).
 */
export function formatMXN(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats a number with thousands separators (no currency symbol).
 */
export function formatNumber(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Formats a number as a percentage.
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Indents account name based on hierarchy depth.
 */
export function indentByDepth(name: string, depth: number, indent: string = '  '): string {
  return `${indent.repeat(depth)}${name}`;
}

/**
 * Formats an account code with dot separators for display.
 * E.g., "1101001" → "110.10.01" based on materialized path convention.
 */
export function formatAccountCodeDisplay(code: string, materializedPath?: string): string {
  if (materializedPath) {
    // Use the path segments as the display form
    const segments = materializedPath.split('.');
    return segments.join('.');
  }
  return code;
}

/**
 * Formats a fiscal period label.
 */
export function formatPeriodLabel(year: number, month: number): string {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    'Ajuste',
  ];
  const monthName = monthNames[month - 1] ?? `Período ${month}`;
  return `${monthName} ${year}`;
}

/**
 * Formats a date for display in Mexican format.
 */
export function formatDateMX(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trimEnd() + '...';
}
