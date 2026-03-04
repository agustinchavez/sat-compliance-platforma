/**
 * Client for the Python AI search microservice.
 * Used by the product service to provide AI-powered SAT code suggestions.
 * Falls back to PostgreSQL full-text search if the AI service is unavailable.
 */

// Types for AI service responses
export interface AISATCodeResult {
  code: string;
  name: string;
  description: string | null;
  division: string | null;
  similarity_score: number | null;
}

export interface AISearchResponse {
  results: AISATCodeResult[];
  query: string;
  total: number;
  search_type: "semantic" | "fulltext" | "hybrid";
}

export interface AIHealthResponse {
  status: string;
  embedding_model_loaded: boolean;
  database_connected: boolean;
  redis_connected: boolean;
  total_sat_codes: number;
  codes_with_embeddings: number;
}

// Custom error for service unavailability
export class SATSearchServiceUnavailableError extends Error {
  constructor() {
    super("AI SAT search service is unavailable");
    this.name = "SATSearchServiceUnavailableError";
  }
}

// Get AI service URL from environment
function getAIServiceURL(): string {
  const url = process.env.AI_SERVICE_URL;
  if (!url) {
    throw new SATSearchServiceUnavailableError();
  }
  return url;
}

/**
 * Search SAT codes using AI-powered semantic search.
 * Call POST /api/v1/sat/search on the AI microservice.
 */
export async function searchSATCodesAI(
  query: string,
  options: {
    top_k?: number;
    threshold?: number;
    category?: string;
  } = {}
): Promise<AISearchResponse> {
  const url = getAIServiceURL();

  try {
    const response = await fetch(`${url}/api/v1/sat/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        top_k: options.top_k ?? 10,
        threshold: options.threshold ?? 0.3,
        category: options.category,
      }),
      // Timeout after 10 seconds
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        throw new SATSearchServiceUnavailableError();
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `AI service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      // Network error or timeout
      throw new SATSearchServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Get details for a specific SAT code.
 * Call GET /api/v1/sat/code/{code} on the AI microservice.
 * Returns null if 404.
 */
export async function getSATCodeDetails(
  code: string
): Promise<AISATCodeResult | null> {
  const url = getAIServiceURL();

  try {
    const response = await fetch(`${url}/api/v1/sat/code/${code}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new SATSearchServiceUnavailableError();
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      throw new SATSearchServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Get SAT codes similar to a given code.
 * Call GET /api/v1/sat/similar/{code} on the AI microservice.
 */
export async function getSimilarSATCodes(
  code: string,
  topK: number = 5
): Promise<AISATCodeResult[]> {
  const url = getAIServiceURL();

  try {
    const response = await fetch(
      `${url}/api/v1/sat/similar/${code}?top_k=${topK}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new SATSearchServiceUnavailableError();
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    const data: AISearchResponse = await response.json();
    return data.results;
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      throw new SATSearchServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Search SAT codes by category (division).
 * Call GET /api/v1/sat/search/category/{category} on the AI microservice.
 */
export async function searchSATCodesByCategory(
  category: string,
  query: string,
  options: {
    top_k?: number;
    threshold?: number;
  } = {}
): Promise<AISearchResponse> {
  const url = getAIServiceURL();

  const params = new URLSearchParams({
    query,
    top_k: String(options.top_k ?? 10),
    threshold: String(options.threshold ?? 0.3),
  });

  try {
    const response = await fetch(
      `${url}/api/v1/sat/search/category/${category}?${params}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      if (response.status >= 500) {
        throw new SATSearchServiceUnavailableError();
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      throw new SATSearchServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Check AI service health.
 * Call GET /health on the AI microservice.
 */
export async function checkAIServiceHealth(): Promise<AIHealthResponse> {
  const url = getAIServiceURL();

  try {
    const response = await fetch(`${url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new SATSearchServiceUnavailableError();
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      throw error;
    }
    throw new SATSearchServiceUnavailableError();
  }
}
