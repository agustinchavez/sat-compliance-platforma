"""
LLM Service for the Tax Assistant (Component 11).

Manages LLM interactions for the tax assistant chatbot.
Primary: Llama 3.1 via Ollama (local, zero cost).
Fallback: GPT-4o-mini via OpenAI API.
"""

import asyncio
import logging
import re
import time
from typing import AsyncGenerator, Optional

import ollama
import openai
import tiktoken

from app.config import Settings
from app.models.conversation import ChatMessage, ConversationContext, RAGSource

logger = logging.getLogger(__name__)

# System prompt — defines the assistant's persona and constraints
SYSTEM_PROMPT = """Eres un asistente fiscal experto en el sistema tributario mexicano y la plataforma de facturación SAT. Ayudas a dueños de empresas y contadores con preguntas sobre CFDI 4.0, IVA, ISR, regímenes fiscales y cumplimiento con el SAT.

You can also respond in English if the user writes in English.

IMPORTANT GUIDELINES:
1. Base your answers on Mexican tax law and SAT regulations as of 2024.
2. When citing amounts, rates, or deadlines, be specific and accurate.
3. For complex legal or tax planning questions, recommend consulting a certified contador público (CPA).
4. Never give advice that could lead to tax evasion or non-compliance.
5. If you are unsure about something, say so clearly rather than guessing.
6. Use the user's context (tax regime, organization type) to personalize your answers.
7. Keep responses concise but complete — most answers should be under 300 words.
8. Use bullet points and numbered lists for multi-step processes.

SCOPE LIMITATIONS:
- You can answer questions about: IVA, ISR, CFDI, SAT procedures, tax regimes, filing deadlines, invoice requirements.
- You should escalate (recommend professional advice) for: tax dispute defense, corporate restructuring, international tax, criminal tax matters.
"""

# Hedge phrases that reduce confidence
HEDGE_PHRASES = [
    "no estoy seguro", "i'm not sure", "i am not sure",
    "might", "podría ser", "tal vez", "perhaps", "maybe",
    "consulta a", "consult with", "te recomiendo consultar",
    "no tengo información", "i don't have information",
    "no puedo", "i cannot", "i can't"
]

# Keywords requiring professional advice
PROFESSIONAL_ADVICE_KEYWORDS = [
    # Tax evasion/criminal
    "evasión", "evasion", "ilegal", "illegal", "penal", "criminal",
    # Corporate restructuring
    "reestructura", "fusión", "escisión", "holding", "merger", "spinoff",
    # Legal proceedings
    "amparo", "recurso de revocación", "juicio fiscal", "demanda",
    # International
    "internacional", "transfer pricing", "precios de transferencia",
    "offshore", "extranjero"
]


class LLMService:
    """
    Manages LLM interactions for the tax assistant.
    Primary: Llama 3.1 via Ollama (local, zero cost).
    Fallback: GPT-4o-mini via OpenAI API.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._ollama_available: Optional[bool] = None
        self._ollama_check_time: float = 0
        self._ollama_check_interval = 60  # Re-check every 60 seconds

        # Initialize OpenAI client if API key provided
        self._openai_client: Optional[openai.AsyncOpenAI] = None
        if settings.openai_api_key:
            self._openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        # Token counter for context management
        try:
            self._tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            self._tokenizer = None

    async def check_ollama_available(self) -> bool:
        """
        Check if Ollama is running and the configured model is available.
        Cache result for 60 seconds to avoid repeated health checks.
        Returns False (not True) if check fails — never raises.
        """
        now = time.time()

        # Use cached result if recent
        if (self._ollama_available is not None and
                now - self._ollama_check_time < self._ollama_check_interval):
            return self._ollama_available

        try:
            client = ollama.AsyncClient(host=self.settings.ollama_base_url)

            # Check if Ollama is running
            models = await asyncio.wait_for(
                client.list(),
                timeout=5.0
            )

            # Check if our model is available
            model_names = [m.get('name', '').split(':')[0] for m in models.get('models', [])]
            available = self.settings.ollama_model in model_names

            self._ollama_available = available
            self._ollama_check_time = now

            if available:
                logger.info(f"Ollama available with model: {self.settings.ollama_model}")
            else:
                logger.warning(
                    f"Ollama running but model '{self.settings.ollama_model}' not found. "
                    f"Available: {model_names}"
                )

            return available

        except Exception as e:
            logger.warning(f"Ollama not available: {e}")
            self._ollama_available = False
            self._ollama_check_time = now
            return False

    def _count_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        if self._tokenizer:
            return len(self._tokenizer.encode(text))
        # Rough estimate: 1 token ≈ 4 characters
        return len(text) // 4

    def _build_user_context_message(self, context: ConversationContext) -> str:
        """Build context string from user context."""
        parts = []

        if context.organization_name:
            parts.append(f"Organization: {context.organization_name}")

        if context.tax_regime:
            regime_names = {
                "601": "General de Ley Personas Morales",
                "612": "Personas Físicas con Actividades Empresariales",
                "621": "Incorporación Fiscal (RIF)",
                "626": "Régimen Simplificado de Confianza (RESICO)",
                "625": "Actividades mediante Plataformas Tecnológicas",
            }
            regime_name = regime_names.get(context.tax_regime, context.tax_regime)
            parts.append(f"Tax regime: {context.tax_regime} ({regime_name})")

        if context.rfc:
            parts.append(f"RFC: {context.rfc}")

        if context.user_role:
            parts.append(f"User role: {context.user_role}")

        if context.monthly_revenue_approx:
            parts.append(f"Approx monthly revenue: ${context.monthly_revenue_approx:,.0f} MXN")

        if context.employee_count_approx:
            parts.append(f"Approx employees: {context.employee_count_approx}")

        if parts:
            return "User context: " + ", ".join(parts) + "."
        return ""

    def build_messages(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext],
        rag_context: str = "",
    ) -> list[dict]:
        """
        Build the messages array for the LLM API call.

        Structure:
        1. System message (SYSTEM_PROMPT + user context if provided)
        2. RAG context as a system message (if rag_context is non-empty)
        3. Conversation history (last N messages from history)
        4. Current user message
        """
        messages = []

        # 1. System message with optional user context
        system_content = SYSTEM_PROMPT
        if context:
            user_context_str = self._build_user_context_message(context)
            if user_context_str:
                system_content += f"\n\n{user_context_str}"

        messages.append({"role": "system", "content": system_content})

        # 2. RAG context as system message
        if rag_context:
            messages.append({
                "role": "system",
                "content": f"Relevant tax information from knowledge base:\n\n{rag_context}"
            })

        # Calculate token budget for history
        # Reserve ~1500 tokens for system prompts + RAG + response
        max_history_tokens = 3000 - 1500
        current_tokens = 0

        # 3. Conversation history (newest first for truncation, then reverse)
        history_messages = []
        for msg in reversed(history[-self.settings.max_conversation_history:]):
            msg_tokens = self._count_tokens(msg.content)
            if current_tokens + msg_tokens > max_history_tokens:
                break
            history_messages.insert(0, {
                "role": msg.role.value if hasattr(msg.role, 'value') else msg.role,
                "content": msg.content
            })
            current_tokens += msg_tokens

        messages.extend(history_messages)

        # 4. Current user message
        messages.append({"role": "user", "content": user_message})

        return messages

    async def generate_response(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext] = None,
        rag_context: str = "",
    ) -> tuple[str, str, Optional[int]]:
        """
        Generate a complete response (non-streaming).

        Returns: (response_text, model_used, tokens_used)
        """
        messages = self.build_messages(user_message, history, context, rag_context)

        # Try Ollama first
        if await self.check_ollama_available():
            try:
                response_text, tokens = await self._call_ollama(messages)
                return response_text, self.settings.ollama_model, tokens
            except Exception as e:
                logger.warning(f"Ollama call failed: {e}, falling back to OpenAI")

        # Fallback to OpenAI
        if self._openai_client:
            try:
                response_text, tokens = await self._call_openai(messages)
                return response_text, self.settings.openai_model, tokens
            except Exception as e:
                logger.error(f"OpenAI call failed: {e}")

        # Both failed
        return (
            "Lo siento, el servicio de IA no está disponible en este momento. "
            "Por favor intenta de nuevo más tarde.\n\n"
            "I'm sorry, the AI service is currently unavailable. "
            "Please try again later.",
            "unavailable",
            None
        )

    async def _call_ollama(self, messages: list[dict]) -> tuple[str, Optional[int]]:
        """Call Ollama API."""
        client = ollama.AsyncClient(host=self.settings.ollama_base_url)

        response = await asyncio.wait_for(
            client.chat(
                model=self.settings.ollama_model,
                messages=messages,
                options={
                    "temperature": self.settings.llm_temperature,
                    "num_predict": self.settings.llm_max_tokens,
                }
            ),
            timeout=self.settings.ollama_timeout_seconds
        )

        content = response.get("message", {}).get("content", "")
        tokens = response.get("eval_count")  # Ollama provides token count

        return content, tokens

    async def _call_openai(self, messages: list[dict]) -> tuple[str, Optional[int]]:
        """Call OpenAI API."""
        response = await self._openai_client.chat.completions.create(
            model=self.settings.openai_model,
            messages=messages,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
        )

        content = response.choices[0].message.content
        tokens = response.usage.total_tokens if response.usage else None

        return content, tokens

    async def stream_response(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext] = None,
        rag_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Stream response tokens as they are generated.
        Yields string chunks as they arrive.
        """
        messages = self.build_messages(user_message, history, context, rag_context)

        # Try Ollama first
        if await self.check_ollama_available():
            try:
                async for chunk in self._stream_ollama(messages):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"Ollama streaming failed: {e}, falling back to OpenAI")

        # Fallback to OpenAI
        if self._openai_client:
            try:
                async for chunk in self._stream_openai(messages):
                    yield chunk
                return
            except Exception as e:
                logger.error(f"OpenAI streaming failed: {e}")

        # Both failed
        yield (
            "Lo siento, el servicio de IA no está disponible en este momento. "
            "Por favor intenta de nuevo más tarde."
        )

    async def _stream_ollama(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """Stream from Ollama."""
        client = ollama.AsyncClient(host=self.settings.ollama_base_url)

        async for part in await client.chat(
            model=self.settings.ollama_model,
            messages=messages,
            stream=True,
            options={
                "temperature": self.settings.llm_temperature,
                "num_predict": self.settings.llm_max_tokens,
            }
        ):
            content = part.get("message", {}).get("content", "")
            if content:
                yield content

    async def _stream_openai(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """Stream from OpenAI."""
        stream = await self._openai_client.chat.completions.create(
            model=self.settings.openai_model,
            messages=messages,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def estimate_confidence(self, response: str, rag_sources: list[RAGSource]) -> float:
        """
        Heuristic confidence score for the response.

        Rules:
        - Base score: 0.7
        - +0.15 if rag_sources is non-empty (grounded in knowledge base)
        - +0.1 if response contains specific numbers/rates/dates
        - -0.2 if response contains hedge phrases
        - -0.3 if response contains "no puedo", "no tengo información"
        """
        confidence = 0.7
        response_lower = response.lower()

        # Bonus for RAG grounding
        if rag_sources:
            confidence += 0.15

        # Bonus for specific information
        if re.search(r'\d+%|\$[\d,]+|\d{1,2}\s+de\s+\w+', response):
            confidence += 0.1

        # Penalty for hedge phrases
        for phrase in HEDGE_PHRASES:
            if phrase in response_lower:
                if "no puedo" in phrase or "no tengo" in phrase:
                    confidence -= 0.3
                else:
                    confidence -= 0.2
                break  # Only penalize once

        # Clamp to [0.0, 1.0]
        return max(0.0, min(1.0, confidence))

    def requires_professional_advice(self, message: str, response: str) -> bool:
        """
        Determine if this Q&A should be flagged for professional advice.

        Flag as True if professional advice keywords are present in
        message or response, or if response recommends consulting.
        """
        combined = (message + " " + response).lower()

        for keyword in PROFESSIONAL_ADVICE_KEYWORDS:
            if keyword.lower() in combined:
                return True

        # Check if response explicitly recommends consulting
        consult_phrases = [
            "te recomiendo consultar",
            "recommend consulting",
            "consulta con un",
            "consult with a",
            "seek professional",
            "busca asesoría"
        ]
        for phrase in consult_phrases:
            if phrase in combined:
                return True

        return False

    async def generate_title(self, first_message: str) -> str:
        """Generate a short title from the first user message."""
        # Simple approach: truncate to 60 chars
        title = first_message.strip()
        if len(title) > 60:
            title = title[:57] + "..."
        return title

    async def generate_summary(self, messages: list[ChatMessage]) -> str:
        """
        Generate a summary of a conversation.
        Used for compressing long conversations.
        """
        if not messages:
            return ""

        # Build a simple prompt for summarization
        conversation_text = "\n".join([
            f"{m.role.value if hasattr(m.role, 'value') else m.role}: {m.content[:200]}"
            for m in messages[-10:]  # Last 10 messages
        ])

        summary_prompt = f"""Summarize the following tax consultation conversation in 3-5 sentences in Spanish.
Focus on the main questions asked and answers given.

Conversation:
{conversation_text}

Summary:"""

        messages_for_llm = [
            {"role": "system", "content": "You are a helpful assistant that summarizes conversations concisely."},
            {"role": "user", "content": summary_prompt}
        ]

        try:
            if await self.check_ollama_available():
                summary, _ = await self._call_ollama(messages_for_llm)
                return summary.strip()

            if self._openai_client:
                summary, _ = await self._call_openai(messages_for_llm)
                return summary.strip()
        except Exception as e:
            logger.warning(f"Failed to generate summary: {e}")

        return ""
