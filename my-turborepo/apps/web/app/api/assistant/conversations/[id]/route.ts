/**
 * Single Conversation API Route (Component 11)
 *
 * Get, update, or delete a specific conversation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

/**
 * GET /api/assistant/conversations/[id]
 * Get conversation history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

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

    // Fetch conversation from AI service
    const response = await fetch(
      `${AI_SERVICE_URL}/api/v1/assistant/conversations/${conversationId}`,
      {
        headers: {
          "X-User-Id": userId,
          "X-Internal-Key": INTERNAL_API_KEY,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.detail || "AI service error" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Conversation GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/assistant/conversations/[id]
 * Delete a conversation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

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

    // Delete conversation via AI service
    const response = await fetch(
      `${AI_SERVICE_URL}/api/v1/assistant/conversations/${conversationId}`,
      {
        method: "DELETE",
        headers: {
          "X-User-Id": userId,
          "X-Internal-Key": INTERNAL_API_KEY,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.detail || "AI service error" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Conversation DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
