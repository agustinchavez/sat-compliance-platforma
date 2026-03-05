/**
 * Tax Assistant Chat Client (Component 11)
 *
 * TypeScript client for the tax assistant chatbot API.
 * Supports both streaming (SSE) and non-streaming responses.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationContext {
  organization_id?: string;
  organization_name?: string;
  tax_regime?: string;
  rfc?: string;
  user_role?: string;
  monthly_revenue_approx?: number;
  employee_count_approx?: number;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  context?: ConversationContext;
  stream?: boolean;
}

export interface RAGSource {
  doc_id: string;
  section_title: string;
  similarity_score: number;
}

export interface ChatResponse {
  message: string;
  conversation_id: string;
  sources: RAGSource[];
  confidence: number;
  model_used: string;
  requires_professional_advice: boolean;
}

export interface StreamChunk {
  type: "chunk" | "done" | "error";
  content: string;
  conversation_id?: string;
  sources?: RAGSource[];
  confidence?: number;
  requires_professional_advice?: boolean;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string | null;
  message_count: number;
  last_message_at?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface ConversationHistory {
  conversation_id: string;
  messages: ChatMessage[];
  context?: ConversationContext;
  total_messages: number;
  summary?: string;
}

export interface AssistantHealth {
  status: "healthy" | "degraded" | "unhealthy";
  llm: {
    ollama_available: boolean;
    openai_configured: boolean;
  };
  knowledge_base: {
    status: string;
    document_count: number;
    last_updated?: string;
  };
}

// ============================================================================
// ERRORS
// ============================================================================

export class AssistantError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

export class AssistantServiceUnavailableError extends AssistantError {
  constructor(message = "Tax assistant service is currently unavailable") {
    super(message, 503, "SERVICE_UNAVAILABLE");
    this.name = "AssistantServiceUnavailableError";
  }
}

export class AssistantAuthenticationError extends AssistantError {
  constructor(message = "Authentication failed") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AssistantAuthenticationError";
  }
}

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

function getAIServiceUrl(): string {
  const url = process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_SERVICE_URL;
  if (!url) {
    throw new AssistantServiceUnavailableError("AI service URL not configured");
  }
  return url;
}

function getInternalApiKey(): string {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) {
    throw new AssistantServiceUnavailableError("Internal API key not configured");
  }
  return key;
}

// ============================================================================
// NON-STREAMING CHAT
// ============================================================================

/**
 * Send a chat message and get a complete response.
 *
 * @param request - Chat request with message and optional context
 * @param userId - User ID for authentication
 * @returns ChatResponse with assistant's reply
 */
export async function sendMessage(
  request: ChatRequest,
  userId: string
): Promise<ChatResponse> {
  const baseUrl = getAIServiceUrl();
  const apiKey = getInternalApiKey();

  const response = await fetch(`${baseUrl}/api/v1/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      "X-Internal-Key": apiKey,
    },
    body: JSON.stringify({
      message: request.message,
      conversation_id: request.conversation_id,
      context: request.context,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new AssistantAuthenticationError();
    }
    if (response.status >= 500) {
      throw new AssistantServiceUnavailableError();
    }

    const error = await response.json().catch(() => ({}));
    throw new AssistantError(
      error.detail || "Chat request failed",
      response.status
    );
  }

  return response.json();
}

// ============================================================================
// STREAMING CHAT
// ============================================================================

/**
 * Send a chat message and stream the response.
 *
 * @param request - Chat request with message and optional context
 * @param userId - User ID for authentication
 * @param onChunk - Callback for each streamed chunk
 * @param onComplete - Callback when streaming completes
 * @param onError - Callback on error
 * @returns Abort controller to cancel the stream
 */
export function streamMessage(
  request: ChatRequest,
  userId: string,
  onChunk: (chunk: StreamChunk) => void,
  onComplete?: (finalChunk: StreamChunk) => void,
  onError?: (error: Error) => void
): AbortController {
  const controller = new AbortController();

  const baseUrl = getAIServiceUrl();
  const apiKey = getInternalApiKey();

  (async () => {
    try {
      const response = await fetch(`${baseUrl}/api/v1/assistant/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
          "X-Internal-Key": apiKey,
        },
        body: JSON.stringify({
          message: request.message,
          conversation_id: request.conversation_id,
          context: request.context,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AssistantAuthenticationError();
        }
        if (response.status >= 500) {
          throw new AssistantServiceUnavailableError();
        }
        throw new AssistantError("Stream request failed", response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new AssistantError("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const chunk: StreamChunk = JSON.parse(data);

                if (chunk.type === "chunk") {
                  onChunk(chunk);
                } else if (chunk.type === "done") {
                  onComplete?.(chunk);
                } else if (chunk.type === "error") {
                  onError?.(new AssistantError(chunk.content));
                }
              } catch {
                // Ignore parse errors for malformed chunks
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Stream was aborted, don't report as error
        return;
      }
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return controller;
}

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

/**
 * List user's conversations.
 *
 * @param userId - User ID
 * @param limit - Max conversations to return (default 20)
 * @param offset - Pagination offset
 * @returns List of conversation summaries
 */
export async function listConversations(
  userId: string,
  limit = 20,
  offset = 0
): Promise<ConversationSummary[]> {
  const baseUrl = getAIServiceUrl();
  const apiKey = getInternalApiKey();

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(
    `${baseUrl}/api/v1/assistant/conversations?${params}`,
    {
      headers: {
        "X-User-Id": userId,
        "X-Internal-Key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new AssistantError(
      "Failed to list conversations",
      response.status
    );
  }

  return response.json();
}

/**
 * Get conversation history.
 *
 * @param conversationId - Conversation ID
 * @param userId - User ID
 * @returns Conversation history with messages
 */
export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ConversationHistory> {
  const baseUrl = getAIServiceUrl();
  const apiKey = getInternalApiKey();

  const response = await fetch(
    `${baseUrl}/api/v1/assistant/conversations/${conversationId}`,
    {
      headers: {
        "X-User-Id": userId,
        "X-Internal-Key": apiKey,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new AssistantError("Conversation not found", 404);
    }
    if (response.status === 403) {
      throw new AssistantError("Access denied", 403);
    }
    throw new AssistantError(
      "Failed to get conversation",
      response.status
    );
  }

  return response.json();
}

/**
 * Delete a conversation.
 *
 * @param conversationId - Conversation ID to delete
 * @param userId - User ID
 * @returns Success status
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<{ deleted: boolean; conversation_id: string }> {
  const baseUrl = getAIServiceUrl();
  const apiKey = getInternalApiKey();

  const response = await fetch(
    `${baseUrl}/api/v1/assistant/conversations/${conversationId}`,
    {
      method: "DELETE",
      headers: {
        "X-User-Id": userId,
        "X-Internal-Key": apiKey,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new AssistantError("Conversation not found", 404);
    }
    throw new AssistantError(
      "Failed to delete conversation",
      response.status
    );
  }

  return response.json();
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check assistant service health.
 *
 * @returns Health status of the assistant service
 */
export async function checkHealth(): Promise<AssistantHealth> {
  const baseUrl = getAIServiceUrl();

  const response = await fetch(`${baseUrl}/api/v1/assistant/health`);

  if (!response.ok) {
    throw new AssistantServiceUnavailableError();
  }

  return response.json();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get confidence level label.
 *
 * @param confidence - Confidence score (0-1)
 * @returns Object with level and label
 */
export function getConfidenceLevel(confidence: number): {
  level: "high" | "medium" | "low";
  label: string;
  color: string;
} {
  if (confidence >= 0.8) {
    return { level: "high", label: "Alta confianza", color: "green" };
  }
  if (confidence >= 0.5) {
    return { level: "medium", label: "Confianza media", color: "yellow" };
  }
  return { level: "low", label: "Baja confianza", color: "red" };
}

/**
 * Format sources for display.
 *
 * @param sources - RAG sources from response
 * @returns Formatted source list
 */
export function formatSources(sources: RAGSource[]): string[] {
  return sources.map((source, index) => {
    const confidence = source.similarity_score >= 0.7 ? "alta" : "media";
    return `${index + 1}. ${source.section_title} (confianza: ${confidence})`;
  });
}

/**
 * Check if response needs professional advice disclaimer.
 *
 * @param response - Chat response
 * @returns Whether to show professional advice warning
 */
export function needsProfessionalAdvice(response: ChatResponse): boolean {
  return response.requires_professional_advice;
}

/**
 * Create a new chat context from user/organization data.
 *
 * @param user - User data
 * @param organization - Organization data
 * @returns ConversationContext for chat requests
 */
export function createChatContext(
  user?: { role?: string },
  organization?: {
    id?: string;
    name?: string;
    tax_regime?: string;
    rfc?: string;
  }
): ConversationContext {
  return {
    organization_id: organization?.id,
    organization_name: organization?.name,
    tax_regime: organization?.tax_regime,
    rfc: organization?.rfc,
    user_role: user?.role,
  };
}
