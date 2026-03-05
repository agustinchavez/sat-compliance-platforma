/**
 * Tests for Tax Assistant Chat Client (Component 11).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendMessage,
  streamMessage,
  listConversations,
  getConversation,
  deleteConversation,
  checkHealth,
  getConfidenceLevel,
  formatSources,
  needsProfessionalAdvice,
  createChatContext,
  AssistantError,
  AssistantServiceUnavailableError,
  AssistantAuthenticationError,
  type ChatResponse,
  type RAGSource,
  type ConversationSummary,
  type ConversationHistory,
  type AssistantHealth,
} from "../chat-client";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
const originalEnv = process.env;

describe("Chat Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      AI_SERVICE_URL: "http://localhost:8000",
      INTERNAL_API_KEY: "test-internal-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("sendMessage", () => {
    it("should send a message and return response", async () => {
      const mockResponse: ChatResponse = {
        message: "El IVA general es 16%.",
        conversation_id: "conv-123",
        sources: [],
        confidence: 0.85,
        model_used: "llama3.1",
        requires_professional_advice: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await sendMessage(
        { message: "¿Cuánto es el IVA?" },
        "user-123"
      );

      expect(result.message).toBe("El IVA general es 16%.");
      expect(result.conversation_id).toBe("conv-123");
      expect(result.confidence).toBe(0.85);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/v1/assistant/chat",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-User-Id": "user-123",
            "X-Internal-Key": "test-internal-key",
          }),
        })
      );
    });

    it("should include conversation_id when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "Response",
            conversation_id: "conv-123",
            sources: [],
            confidence: 0.8,
            model_used: "llama3.1",
            requires_professional_advice: false,
          }),
      });

      await sendMessage(
        { message: "Follow up", conversation_id: "conv-123" },
        "user-123"
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.conversation_id).toBe("conv-123");
    });

    it("should include context when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "Response",
            conversation_id: "conv-123",
            sources: [],
            confidence: 0.8,
            model_used: "llama3.1",
            requires_professional_advice: false,
          }),
      });

      await sendMessage(
        {
          message: "Question",
          context: {
            organization_name: "Mi Empresa",
            tax_regime: "601",
          },
        },
        "user-123"
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.context.organization_name).toBe("Mi Empresa");
      expect(callBody.context.tax_regime).toBe("601");
    });

    it("should throw AssistantAuthenticationError for 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        sendMessage({ message: "Test" }, "user-123")
      ).rejects.toThrow(AssistantAuthenticationError);
    });

    it("should throw AssistantServiceUnavailableError for 5xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        sendMessage({ message: "Test" }, "user-123")
      ).rejects.toThrow(AssistantServiceUnavailableError);
    });

    it("should throw AssistantServiceUnavailableError when URL not configured", async () => {
      delete process.env.AI_SERVICE_URL;
      delete process.env.NEXT_PUBLIC_AI_SERVICE_URL;

      await expect(
        sendMessage({ message: "Test" }, "user-123")
      ).rejects.toThrow(AssistantServiceUnavailableError);
    });
  });

  describe("streamMessage", () => {
    it("should stream message chunks", async () => {
      const chunks: string[] = [];
      let completeCalled = false;

      // Create a mock readable stream
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"chunk","content":"El ","conversation_id":"conv-123"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"type":"chunk","content":"IVA ","conversation_id":"conv-123"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"type":"done","content":"","conversation_id":"conv-123","confidence":0.85}\n\n'
            )
          );
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const controller = streamMessage(
        { message: "¿Cuánto es el IVA?" },
        "user-123",
        (chunk) => {
          chunks.push(chunk.content);
        },
        () => {
          completeCalled = true;
        }
      );

      // Wait for stream to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(chunks).toContain("El ");
      expect(chunks).toContain("IVA ");
      expect(completeCalled).toBe(true);
      expect(controller).toBeInstanceOf(AbortController);
    });

    it("should handle stream errors", async () => {
      let errorCalled = false;
      let errorMessage = "";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      streamMessage(
        { message: "Test" },
        "user-123",
        () => {},
        () => {},
        (error) => {
          errorCalled = true;
          errorMessage = error.message;
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorCalled).toBe(true);
    });
  });

  describe("listConversations", () => {
    it("should return list of conversations", async () => {
      const mockConversations: ConversationSummary[] = [
        {
          conversation_id: "conv-1",
          title: "IVA Questions",
          message_count: 5,
        },
        {
          conversation_id: "conv-2",
          title: "CFDI Help",
          message_count: 3,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConversations),
      });

      const result = await listConversations("user-123");

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("IVA Questions");
      expect(result[1].title).toBe("CFDI Help");
    });

    it("should pass pagination parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await listConversations("user-123", 10, 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=10"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("offset=20"),
        expect.any(Object)
      );
    });
  });

  describe("getConversation", () => {
    it("should return conversation history", async () => {
      const mockHistory: ConversationHistory = {
        conversation_id: "conv-123",
        messages: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "¡Hola!" },
        ],
        total_messages: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      });

      const result = await getConversation("conv-123", "user-123");

      expect(result.conversation_id).toBe("conv-123");
      expect(result.messages).toHaveLength(2);
    });

    it("should throw error for not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        getConversation("invalid", "user-123")
      ).rejects.toThrow(AssistantError);
    });

    it("should throw error for access denied", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(
        getConversation("conv-123", "other-user")
      ).rejects.toThrow(AssistantError);
    });
  });

  describe("deleteConversation", () => {
    it("should delete conversation and return status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ deleted: true, conversation_id: "conv-123" }),
      });

      const result = await deleteConversation("conv-123", "user-123");

      expect(result.deleted).toBe(true);
      expect(result.conversation_id).toBe("conv-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/conversations/conv-123"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("checkHealth", () => {
    it("should return health status", async () => {
      const mockHealth: AssistantHealth = {
        status: "healthy",
        llm: {
          ollama_available: true,
          openai_configured: true,
        },
        knowledge_base: {
          status: "healthy",
          document_count: 50,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHealth),
      });

      const result = await checkHealth();

      expect(result.status).toBe("healthy");
      expect(result.llm.ollama_available).toBe(true);
      expect(result.knowledge_base.document_count).toBe(50);
    });

    it("should throw error when service unavailable", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      await expect(checkHealth()).rejects.toThrow(
        AssistantServiceUnavailableError
      );
    });
  });

  describe("getConfidenceLevel", () => {
    it("should return high for >= 0.8", () => {
      const result = getConfidenceLevel(0.9);
      expect(result.level).toBe("high");
      expect(result.label).toBe("Alta confianza");
      expect(result.color).toBe("green");
    });

    it("should return medium for >= 0.5", () => {
      const result = getConfidenceLevel(0.6);
      expect(result.level).toBe("medium");
      expect(result.label).toBe("Confianza media");
      expect(result.color).toBe("yellow");
    });

    it("should return low for < 0.5", () => {
      const result = getConfidenceLevel(0.3);
      expect(result.level).toBe("low");
      expect(result.label).toBe("Baja confianza");
      expect(result.color).toBe("red");
    });
  });

  describe("formatSources", () => {
    it("should format sources with confidence labels", () => {
      const sources: RAGSource[] = [
        { doc_id: "doc1", section_title: "IVA Rates", similarity_score: 0.9 },
        { doc_id: "doc2", section_title: "ISR Calc", similarity_score: 0.6 },
      ];

      const result = formatSources(sources);

      expect(result[0]).toContain("1. IVA Rates");
      expect(result[0]).toContain("alta");
      expect(result[1]).toContain("2. ISR Calc");
      expect(result[1]).toContain("media");
    });

    it("should return empty array for no sources", () => {
      const result = formatSources([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("needsProfessionalAdvice", () => {
    it("should return true when requires_professional_advice is true", () => {
      const response: ChatResponse = {
        message: "Test",
        conversation_id: "conv-123",
        sources: [],
        confidence: 0.5,
        model_used: "llama3.1",
        requires_professional_advice: true,
      };

      expect(needsProfessionalAdvice(response)).toBe(true);
    });

    it("should return false when requires_professional_advice is false", () => {
      const response: ChatResponse = {
        message: "Test",
        conversation_id: "conv-123",
        sources: [],
        confidence: 0.9,
        model_used: "llama3.1",
        requires_professional_advice: false,
      };

      expect(needsProfessionalAdvice(response)).toBe(false);
    });
  });

  describe("createChatContext", () => {
    it("should create context from user and organization", () => {
      const context = createChatContext(
        { role: "admin" },
        {
          id: "org-123",
          name: "Mi Empresa",
          tax_regime: "601",
          rfc: "ABC123456XY9",
        }
      );

      expect(context.organization_id).toBe("org-123");
      expect(context.organization_name).toBe("Mi Empresa");
      expect(context.tax_regime).toBe("601");
      expect(context.rfc).toBe("ABC123456XY9");
      expect(context.user_role).toBe("admin");
    });

    it("should handle missing data gracefully", () => {
      const context = createChatContext();

      expect(context.organization_id).toBeUndefined();
      expect(context.user_role).toBeUndefined();
    });
  });
});
