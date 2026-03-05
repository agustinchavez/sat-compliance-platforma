/**
 * Tax Assistant Chat API Route (Component 11)
 *
 * Proxies chat requests to the AI service with authentication.
 * Supports both streaming (SSE) and non-streaming responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

interface ChatRequestBody {
  message: string;
  conversation_id?: string;
  context?: {
    organization_id?: string;
    organization_name?: string;
    tax_regime?: string;
    rfc?: string;
    user_role?: string;
  };
  stream?: boolean;
}

/**
 * POST /api/assistant/chat
 * Send a message to the tax assistant
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's internal ID
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userId = userData.id;

    // Parse request body
    const body: ChatRequestBody = await request.json();

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Enhance context with user's organization data if not provided
    let context = body.context;
    if (!context?.organization_id) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select(
          `
          role,
          organization:organizations(
            id,
            name,
            tax_regime,
            rfc
          )
        `
        )
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (membership?.organization) {
        const org = membership.organization as {
          id: string;
          name: string;
          tax_regime?: string;
          rfc?: string;
        };
        context = {
          organization_id: org.id,
          organization_name: org.name,
          tax_regime: org.tax_regime,
          rfc: org.rfc,
          user_role: membership.role,
          ...context,
        };
      }
    }

    // Determine if streaming is requested
    const useStreaming = body.stream === true;

    if (useStreaming) {
      // Stream response from AI service
      return streamChat(userId, body.message, body.conversation_id, context);
    } else {
      // Non-streaming response
      return nonStreamingChat(
        userId,
        body.message,
        body.conversation_id,
        context
      );
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Non-streaming chat response
 */
async function nonStreamingChat(
  userId: string,
  message: string,
  conversationId?: string,
  context?: ChatRequestBody["context"]
) {
  const response = await fetch(`${AI_SERVICE_URL}/api/v1/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      "X-Internal-Key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      context,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: errorData.detail || "AI service error" },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}

/**
 * Streaming chat response (SSE)
 */
async function streamChat(
  userId: string,
  message: string,
  conversationId?: string,
  context?: ChatRequestBody["context"]
) {
  const response = await fetch(
    `${AI_SERVICE_URL}/api/v1/assistant/chat/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
        "X-Internal-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        context,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: errorData.detail || "AI service error" },
      { status: response.status }
    );
  }

  // Stream the response back to the client
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
