/**
 * SAT Codes Service
 *
 * Manages SAT product codes (ClaveProdServ) and unit codes (ClaveUnidad)
 * for CFDI invoice generation. Provides search, validation, and suggestion
 * functionality for the 55,000+ product codes and 2,800+ unit codes.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  SATProductCode,
  SATUnitCode,
  SATCodeSuggestion,
} from './types';
import {
  COMMON_UNIT_CODES,
  COMMON_PRODUCT_CODES,
} from './types';
import {
  searchSATCodesAI,
  SATSearchServiceUnavailableError,
} from './ai-search-client';

// ============================================================================
// SAT Product Codes (ClaveProdServ)
// ============================================================================

/**
 * Search SAT product codes by text query
 *
 * @param query - Search query (name or description)
 * @param limit - Maximum results to return (default: 20)
 * @returns Array of matching SAT product codes
 *
 * @example
 * ```ts
 * const results = await searchSATProductCodes('consultoría');
 * // → [{ code: '81112100', name: 'Servicios de consultoría...', ... }]
 * ```
 */
export async function searchSATProductCodes(
  query: string,
  limit: number = 20
): Promise<SATProductCode[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const supabase = await createClient();

  // Use PostgreSQL full-text search
  const searchTerms = query.trim().split(/\s+/).join(' & ');

  const { data, error } = await supabase
    .from('sat_product_codes')
    .select('code, name, description, division, "group", class')
    .textSearch('search_vector', searchTerms, {
      type: 'websearch',
      config: 'spanish',
    })
    .limit(limit);

  if (error) {
    // Fallback to ILIKE search if full-text fails
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('sat_product_codes')
      .select('code, name, description, division, "group", class')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit);

    if (fallbackError) {
      console.error('Error searching SAT product codes:', fallbackError);
      return [];
    }

    return (fallbackData || []).map(mapSATProductCode);
  }

  return (data || []).map(mapSATProductCode);
}

/**
 * Get a specific SAT product code by code
 *
 * @param code - SAT product code (e.g., '81112100')
 * @returns SAT product code info or null if not found
 */
export async function getSATProductCode(code: string): Promise<SATProductCode | null> {
  if (!code) return null;

  // Check common codes first (fast path)
  const commonName = COMMON_PRODUCT_CODES[code];
  if (commonName) {
    return {
      code,
      name: commonName,
      division: code.substring(0, 2),
      group: code.substring(0, 4),
      class: code.substring(0, 6),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sat_product_codes')
    .select('code, name, description, division, "group", class')
    .eq('code', code)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSATProductCode(data);
}

/**
 * Validate if a SAT product code exists
 *
 * @param code - SAT product code to validate
 * @returns True if the code exists
 */
export async function validateSATProductCode(code: string): Promise<boolean> {
  if (!code) return false;

  // Check common codes first
  if (code in COMMON_PRODUCT_CODES) {
    return true;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from('sat_product_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code', code);

  if (error) {
    console.error('Error validating SAT product code:', error);
    return false;
  }

  return (count || 0) > 0;
}

/**
 * Get SAT product codes by division (first 2 digits)
 *
 * @param division - Division code (e.g., '81' for services)
 * @param limit - Maximum results
 * @returns Array of SAT product codes in the division
 */
export async function getSATProductCodesByDivision(
  division: string,
  limit: number = 100
): Promise<SATProductCode[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sat_product_codes')
    .select('code, name, description, division, "group", class')
    .eq('division', division)
    .order('code')
    .limit(limit);

  if (error) {
    console.error('Error fetching SAT codes by division:', error);
    return [];
  }

  return (data || []).map(mapSATProductCode);
}

/**
 * Suggest SAT product codes based on product description
 *
 * Uses AI-powered semantic search with fallback to PostgreSQL full-text search.
 * The AI service uses multilingual embeddings for better matching of
 * Spanish and English queries.
 *
 * @param description - Product name or description
 * @param limit - Maximum suggestions (default: 5)
 * @param options - Optional search options
 * @returns Array of code suggestions with relevance scores
 */
export async function suggestSATCode(
  description: string,
  limit: number = 5,
  options: { threshold?: number } = {}
): Promise<SATCodeSuggestion[]> {
  if (!description || description.trim().length < 2) {
    return [];
  }

  // Try AI service first for semantic search
  try {
    const aiResults = await searchSATCodesAI(description, {
      top_k: limit,
      threshold: options.threshold ?? 0.35,
    });

    return aiResults.results.map((r) => ({
      code: r.code,
      name: r.name,
      score: r.similarity_score ?? 0,
      source: aiResults.search_type,
    }));
  } catch (error) {
    // If AI service is unavailable, fall back to PostgreSQL text search
    if (error instanceof SATSearchServiceUnavailableError) {
      console.log('AI service unavailable, falling back to text search');
      return suggestSATCodeFallback(description, limit);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Fallback SAT code suggestion using PostgreSQL full-text search
 * Used when the AI service is unavailable
 */
async function suggestSATCodeFallback(
  description: string,
  limit: number = 5
): Promise<SATCodeSuggestion[]> {
  const supabase = await createClient();

  // Extract keywords from description
  const keywords = description
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Build search query
  const searchQuery = keywords.join(' | ');

  const { data, error } = await supabase
    .from('sat_product_codes')
    .select('code, name, description')
    .textSearch('search_vector', searchQuery, {
      type: 'websearch',
      config: 'spanish',
    })
    .limit(limit * 2); // Get more to filter and score

  if (error) {
    console.error('Error suggesting SAT codes:', error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Score results based on keyword matches
  const scored = data.map(item => {
    const text = `${item.name} ${item.description || ''}`.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchCount++;
      }
    }

    const score = matchCount / keywords.length;

    return {
      code: item.code,
      name: item.name,
      score,
      source: 'fulltext' as const,
    };
  });

  // Sort by score and return top results
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter(item => item.score > 0);
}

/**
 * Get popular/common SAT product codes
 *
 * Returns frequently used codes for quick access
 *
 * @param type - 'product' or 'service' (optional filter)
 * @returns Array of popular SAT product codes
 */
export function getPopularSATCodes(type?: 'product' | 'service'): SATProductCode[] {
  const codes = Object.entries(COMMON_PRODUCT_CODES).map(([code, name]) => ({
    code,
    name,
    division: code.substring(0, 2),
    group: code.substring(0, 4),
    class: code.substring(0, 6),
  }));

  if (!type) {
    return codes;
  }

  // Filter by type based on division
  // 80-84: Services, 43-44: Products, etc.
  if (type === 'service') {
    return codes.filter(c => {
      const div = parseInt(c.division, 10);
      return div >= 80 && div <= 89;
    });
  }

  if (type === 'product') {
    return codes.filter(c => {
      const div = parseInt(c.division, 10);
      return div < 70 || div >= 90;
    });
  }

  return codes;
}

// ============================================================================
// SAT Unit Codes (ClaveUnidad)
// ============================================================================

/**
 * Search SAT unit codes by text query
 *
 * @param query - Search query (name or description)
 * @param limit - Maximum results (default: 20)
 * @returns Array of matching SAT unit codes
 */
export async function searchSATUnitCodes(
  query: string,
  limit: number = 20
): Promise<SATUnitCode[]> {
  if (!query || query.trim().length === 0) {
    // Return common codes if no query
    return Object.entries(COMMON_UNIT_CODES).map(([code, name]) => ({
      code,
      name,
    }));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sat_unit_codes')
    .select('code, name, description, symbol')
    .or(`name.ilike.%${query}%,description.ilike.%${query}%,code.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('Error searching SAT unit codes:', error);
    return [];
  }

  return (data || []).map(mapSATUnitCode);
}

/**
 * Get a specific SAT unit code by code
 *
 * @param code - SAT unit code (e.g., 'H87', 'E48')
 * @returns SAT unit code info or null if not found
 */
export async function getSATUnitCode(code: string): Promise<SATUnitCode | null> {
  if (!code) return null;

  // Check common codes first
  const commonUnitName = COMMON_UNIT_CODES[code];
  if (commonUnitName) {
    return {
      code,
      name: commonUnitName,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sat_unit_codes')
    .select('code, name, description, symbol')
    .eq('code', code)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSATUnitCode(data);
}

/**
 * Validate if a SAT unit code exists
 *
 * @param code - SAT unit code to validate
 * @returns True if the code exists
 */
export async function validateSATUnitCode(code: string): Promise<boolean> {
  if (!code) return false;

  // Check common codes first
  if (code in COMMON_UNIT_CODES) {
    return true;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from('sat_unit_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code', code);

  if (error) {
    console.error('Error validating SAT unit code:', error);
    return false;
  }

  return (count || 0) > 0;
}

/**
 * Get common SAT unit codes for quick access
 *
 * @returns Object mapping code to name for common units
 */
export function getCommonUnitCodes(): Record<string, string> {
  return { ...COMMON_UNIT_CODES };
}

/**
 * Get all common SAT unit codes as array
 *
 * @returns Array of common SAT unit codes
 */
export function getCommonUnitCodesArray(): SATUnitCode[] {
  return Object.entries(COMMON_UNIT_CODES).map(([code, name]) => ({
    code,
    name,
  }));
}

/**
 * Get suggested unit code based on product type
 *
 * @param type - 'product' or 'service'
 * @returns Suggested unit code
 */
export function getSuggestedUnitCode(type: 'product' | 'service'): SATUnitCode {
  if (type === 'service') {
    return { code: 'E48', name: 'Unidad de servicio' };
  }
  return { code: 'H87', name: 'Pieza' };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapSATProductCode(data: Record<string, unknown>): SATProductCode {
  return {
    code: data.code as string,
    name: data.name as string,
    description: data.description as string | undefined,
    division: data.division as string | undefined,
    group: data.group as string | undefined,
    class: data.class as string | undefined,
  };
}

function mapSATUnitCode(data: Record<string, unknown>): SATUnitCode {
  return {
    code: data.code as string,
    name: data.name as string,
    description: data.description as string | undefined,
    symbol: data.symbol as string | undefined,
  };
}

// ============================================================================
// SAT Code Hierarchy
// ============================================================================

/**
 * SAT Product Code divisions (first 2 digits)
 */
export const SAT_DIVISIONS: Record<string, string> = {
  '10': 'Animales vivos y productos de origen animal',
  '11': 'Productos alimenticios',
  '12': 'Químicos y productos químicos',
  '13': 'Resinas, plásticos y productos de caucho',
  '14': 'Productos de papel',
  '15': 'Combustibles y lubricantes',
  '20': 'Equipo y maquinaria de minería',
  '21': 'Equipo agrícola y de jardinería',
  '22': 'Equipo para construcción y edificación',
  '23': 'Maquinaria industrial',
  '24': 'Equipo de manipulación y almacenamiento',
  '25': 'Vehículos comerciales',
  '26': 'Equipo de generación y distribución de energía',
  '27': 'Herramientas y maquinaria general',
  '30': 'Estructuras y edificios',
  '31': 'Componentes y suministros de manufactura',
  '32': 'Componentes y suministros electrónicos',
  '39': 'Iluminación y accesorios eléctricos',
  '40': 'Sistemas de distribución y acondicionamiento',
  '41': 'Equipo de laboratorio y medición',
  '42': 'Equipo y suministros médicos',
  '43': 'Tecnología de la información',
  '44': 'Maquinaria y equipo de oficina',
  '45': 'Equipo de imprenta y publicación',
  '46': 'Equipo de defensa y seguridad',
  '47': 'Equipo para limpieza',
  '48': 'Equipos de servicio y suministros',
  '49': 'Equipo deportivo y recreativo',
  '50': 'Alimentos y bebidas',
  '51': 'Medicamentos y productos farmacéuticos',
  '52': 'Muebles domésticos',
  '53': 'Ropa y calzado',
  '54': 'Equipos de relojería y joyería',
  '55': 'Equipos impresos y publicados',
  '56': 'Muebles y mobiliario',
  '60': 'Productos de transporte',
  '70': 'Servicios de agricultura y ganadería',
  '71': 'Servicios de minería y petróleo',
  '72': 'Servicios de construcción y mantenimiento',
  '73': 'Servicios de producción industrial',
  '76': 'Servicios de limpieza',
  '77': 'Servicios ambientales',
  '78': 'Servicios de transporte y almacenaje',
  '80': 'Servicios de gestión y administración',
  '81': 'Servicios de ingeniería e investigación',
  '82': 'Servicios de publicidad y mercadeo',
  '83': 'Servicios públicos y comunitarios',
  '84': 'Servicios financieros y de seguros',
  '85': 'Servicios de salud',
  '86': 'Servicios de educación y capacitación',
  '90': 'Servicios de viajes y hospedaje',
  '91': 'Servicios personales y domésticos',
  '92': 'Servicios de seguridad nacional',
  '93': 'Servicios políticos y de asuntos cívicos',
  '94': 'Organizaciones y clubes',
  '95': 'Entretenimiento y recreación',
};

/**
 * Get division name by code
 */
export function getDivisionName(code: string): string | undefined {
  const division = code.substring(0, 2);
  return SAT_DIVISIONS[division];
}

/**
 * Check if SAT code is for services
 */
export function isServiceCode(code: string): boolean {
  const division = parseInt(code.substring(0, 2), 10);
  return division >= 70 && division <= 95;
}

/**
 * Check if SAT code is for products
 */
export function isProductCode(code: string): boolean {
  return !isServiceCode(code);
}
