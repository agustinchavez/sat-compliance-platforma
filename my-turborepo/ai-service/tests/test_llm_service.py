"""
Tests for LLM Service (Component 11).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.config import Settings
from app.models.conversation import ChatMessage, ConversationContext, MessageRole, RAGSource
from app.services.llm import LLMService, SYSTEM_PROMPT, HEDGE_PHRASES


@pytest.fixture
def settings():
    """Create test settings."""
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_service_key="test-key",
        ollama_base_url="http://localhost:11434",
        ollama_model="llama3.1",
        openai_api_key="test-openai-key",
        openai_model="gpt-4o-mini",
        llm_temperature=0.3,
        llm_max_tokens=1024,
        max_conversation_history=20,
    )


@pytest.fixture
def llm_service(settings):
    """Create LLM service instance."""
    return LLMService(settings)


@pytest.fixture
def sample_history():
    """Create sample conversation history."""
    return [
        ChatMessage(role=MessageRole.USER, content="¿Qué es el IVA?"),
        ChatMessage(role=MessageRole.ASSISTANT, content="El IVA es el Impuesto al Valor Agregado."),
    ]


@pytest.fixture
def sample_context():
    """Create sample user context."""
    return ConversationContext(
        organization_name="Mi Empresa SA",
        tax_regime="601",
        rfc="ABC123456XY9",
        user_role="admin",
    )


class TestBuildMessages:
    """Tests for build_messages method."""

    def test_includes_system_prompt_as_first_message(self, llm_service):
        """Test system prompt is always the first message."""
        messages = llm_service.build_messages(
            user_message="Hola",
            history=[],
            context=None,
            rag_context="",
        )

        assert len(messages) >= 2
        assert messages[0]["role"] == "system"
        assert "asistente fiscal" in messages[0]["content"].lower()

    def test_injects_user_context_into_system_message(self, llm_service, sample_context):
        """Test user context is added to system message when provided."""
        messages = llm_service.build_messages(
            user_message="¿Cuáles son mis obligaciones?",
            history=[],
            context=sample_context,
            rag_context="",
        )

        system_content = messages[0]["content"]
        assert "Mi Empresa SA" in system_content
        assert "601" in system_content
        assert "ABC123456XY9" in system_content

    def test_includes_rag_context_as_separate_system_message(self, llm_service):
        """Test RAG context is added as separate system message when non-empty."""
        rag_context = "El IVA en México tiene una tasa general del 16%."

        messages = llm_service.build_messages(
            user_message="¿Cuál es la tasa de IVA?",
            history=[],
            context=None,
            rag_context=rag_context,
        )

        # Should have system prompt + RAG system message + user message
        assert len(messages) >= 3

        # Find RAG system message
        rag_messages = [m for m in messages if m["role"] == "system" and "knowledge base" in m["content"].lower()]
        assert len(rag_messages) == 1
        assert "16%" in rag_messages[0]["content"]

    def test_includes_conversation_history(self, llm_service, sample_history):
        """Test conversation history is included in messages."""
        messages = llm_service.build_messages(
            user_message="Dime más",
            history=sample_history,
            context=None,
            rag_context="",
        )

        # Should have: system + history (2 messages) + current user message
        assert len(messages) >= 4

        # Find history messages
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        assert len(user_msgs) == 2  # history + current
        assert len(assistant_msgs) == 1

    def test_truncates_history_to_stay_within_token_limit(self, llm_service):
        """Test history is truncated when it exceeds token limit."""
        # Create a long history
        long_history = []
        for i in range(50):
            long_history.append(ChatMessage(
                role=MessageRole.USER,
                content=f"Este es un mensaje largo número {i} con mucho contenido " * 10
            ))
            long_history.append(ChatMessage(
                role=MessageRole.ASSISTANT,
                content=f"Esta es una respuesta larga número {i} con mucho contenido " * 10
            ))

        messages = llm_service.build_messages(
            user_message="Nueva pregunta",
            history=long_history,
            context=None,
            rag_context="",
        )

        # Should have truncated - not all 100 history messages
        # System + some history + user message
        history_count = len([m for m in messages if m["role"] in ["user", "assistant"]]) - 1  # -1 for current
        assert history_count < 100

    def test_user_message_is_last(self, llm_service, sample_history):
        """Test current user message is always last."""
        messages = llm_service.build_messages(
            user_message="Mi pregunta actual",
            history=sample_history,
            context=None,
            rag_context="",
        )

        assert messages[-1]["role"] == "user"
        assert messages[-1]["content"] == "Mi pregunta actual"

    def test_handles_empty_history(self, llm_service):
        """Test handles empty conversation history."""
        messages = llm_service.build_messages(
            user_message="Primera pregunta",
            history=[],
            context=None,
            rag_context="",
        )

        assert len(messages) == 2  # system + user
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


class TestEstimateConfidence:
    """Tests for estimate_confidence method."""

    def test_returns_base_score_for_neutral_response(self, llm_service):
        """Test base score of 0.7 for neutral response without special features."""
        response = "El plazo para presentar la declaración anual es en abril."
        confidence = llm_service.estimate_confidence(response, [])

        assert confidence == pytest.approx(0.7, abs=0.01)

    def test_adds_bonus_for_rag_sources(self, llm_service):
        """Test +0.15 bonus when RAG sources are provided."""
        response = "El plazo para presentar la declaración anual es en abril."
        rag_sources = [
            RAGSource(doc_id="test", section_title="Calendar", similarity_score=0.9)
        ]
        confidence = llm_service.estimate_confidence(response, rag_sources)

        assert confidence == pytest.approx(0.85, abs=0.01)

    def test_adds_bonus_for_specific_information(self, llm_service):
        """Test +0.1 bonus for specific numbers/rates/dates."""
        response = "La tasa general del IVA es 16% y la declaración debe presentarse el 17 de abril."
        confidence = llm_service.estimate_confidence(response, [])

        assert confidence == pytest.approx(0.8, abs=0.01)

    def test_subtracts_for_hedge_phrases(self, llm_service):
        """Test -0.2 penalty for hedge phrases."""
        response = "No estoy seguro, pero creo que el plazo es en abril."
        confidence = llm_service.estimate_confidence(response, [])

        assert confidence == pytest.approx(0.5, abs=0.01)

    def test_subtracts_more_for_cannot_answer_phrases(self, llm_service):
        """Test -0.3 penalty for 'no puedo' type phrases."""
        response = "No puedo responder esa pregunta con certeza."
        confidence = llm_service.estimate_confidence(response, [])

        assert confidence == pytest.approx(0.4, abs=0.01)

    def test_confidence_clamped_to_valid_range(self, llm_service):
        """Test confidence is clamped between 0 and 1."""
        # Very positive response with RAG and specifics
        positive_response = "La tasa es 16% según el artículo 1 de la Ley del IVA del 15 de marzo."
        rag_sources = [RAGSource(doc_id="test", section_title="IVA", similarity_score=0.95)]
        high_confidence = llm_service.estimate_confidence(positive_response, rag_sources)
        assert 0.0 <= high_confidence <= 1.0

        # Very negative response
        negative_response = "No estoy seguro, no puedo, tal vez, perhaps, no tengo información."
        low_confidence = llm_service.estimate_confidence(negative_response, [])
        assert 0.0 <= low_confidence <= 1.0

    def test_combined_bonuses_and_penalties(self, llm_service):
        """Test combination of RAG bonus with specifics."""
        response = "La tasa del IVA es 16% según la ley vigente."
        rag_sources = [RAGSource(doc_id="iva", section_title="Tasas", similarity_score=0.9)]
        confidence = llm_service.estimate_confidence(response, rag_sources)

        # Base 0.7 + 0.15 RAG + 0.1 specifics = 0.95
        assert confidence == pytest.approx(0.95, abs=0.01)


class TestRequiresProfessionalAdvice:
    """Tests for requires_professional_advice method."""

    def test_returns_true_for_evasion_fiscal(self, llm_service):
        """Test detects tax evasion queries."""
        message = "¿Cómo puedo evitar pagar impuestos?"
        response = "No puedo ayudar con evasión fiscal."

        assert llm_service.requires_professional_advice(message, response) is True

    def test_returns_true_for_international_tax(self, llm_service):
        """Test detects international tax queries."""
        message = "Tengo operaciones internacionales"
        response = "Para precios de transferencia consulta con un especialista."

        assert llm_service.requires_professional_advice(message, response) is True

    def test_returns_true_for_legal_proceedings(self, llm_service):
        """Test detects legal proceeding queries."""
        message = "El SAT me notificó un amparo"
        response = "Los procedimientos de amparo requieren asesoría legal especializada."

        assert llm_service.requires_professional_advice(message, response) is True

    def test_returns_true_for_corporate_restructuring(self, llm_service):
        """Test detects corporate restructuring queries."""
        message = "Quiero hacer una fusión de empresas"
        response = "La fusión requiere planeación fiscal cuidadosa."

        assert llm_service.requires_professional_advice(message, response) is True

    def test_returns_true_when_response_recommends_consulting(self, llm_service):
        """Test detects when response recommends professional consultation."""
        message = "¿Cómo defiendo mi caso?"
        response = "Te recomiendo consultar con un contador público certificado."

        assert llm_service.requires_professional_advice(message, response) is True

    def test_returns_false_for_simple_iva_question(self, llm_service):
        """Test returns False for simple tax questions."""
        message = "¿Cuánto es el IVA?"
        response = "El IVA general en México es del 16%."

        assert llm_service.requires_professional_advice(message, response) is False

    def test_returns_false_for_cfdi_question(self, llm_service):
        """Test returns False for CFDI questions."""
        message = "¿Cómo emito un CFDI?"
        response = "Para emitir un CFDI necesitas tu certificado de sello digital."

        assert llm_service.requires_professional_advice(message, response) is False

    def test_returns_false_for_deadline_question(self, llm_service):
        """Test returns False for filing deadline questions."""
        message = "¿Cuándo debo presentar mi declaración?"
        response = "Las personas morales presentan su declaración anual en marzo."

        assert llm_service.requires_professional_advice(message, response) is False


class TestGenerateResponse:
    """Tests for generate_response method."""

    @pytest.mark.asyncio
    async def test_falls_back_to_openai_when_ollama_unavailable(self, llm_service):
        """Test fallback to GPT-4o-mini when Ollama is unavailable."""
        # Mock Ollama as unavailable
        llm_service._ollama_available = False
        llm_service._ollama_check_time = 999999999999  # Far future

        # Mock OpenAI call
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "El IVA es 16%"
        mock_response.usage = MagicMock(total_tokens=100)

        with patch.object(
            llm_service._openai_client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response
        ):
            response_text, model_used, tokens = await llm_service.generate_response(
                user_message="¿Cuánto es el IVA?",
                history=[],
                context=None,
            )

            assert response_text == "El IVA es 16%"
            assert model_used == "gpt-4o-mini"
            assert tokens == 100

    @pytest.mark.asyncio
    async def test_returns_graceful_error_when_both_llms_unavailable(self, settings):
        """Test graceful error message when both LLMs are unavailable."""
        # Create service without OpenAI key
        settings.openai_api_key = None
        service = LLMService(settings)

        # Mock Ollama as unavailable
        service._ollama_available = False
        service._ollama_check_time = 999999999999

        response_text, model_used, tokens = await service.generate_response(
            user_message="¿Cuánto es el IVA?",
            history=[],
            context=None,
        )

        assert "no está disponible" in response_text.lower() or "unavailable" in response_text.lower()
        assert model_used == "unavailable"
        assert tokens is None

    @pytest.mark.asyncio
    async def test_uses_ollama_when_available(self, llm_service):
        """Test uses Ollama as primary when available."""
        # Mock Ollama as available
        with patch.object(llm_service, "check_ollama_available", new_callable=AsyncMock, return_value=True):
            with patch.object(
                llm_service,
                "_call_ollama",
                new_callable=AsyncMock,
                return_value=("Respuesta de Ollama", 50)
            ):
                response_text, model_used, tokens = await llm_service.generate_response(
                    user_message="Hola",
                    history=[],
                    context=None,
                )

                assert response_text == "Respuesta de Ollama"
                assert model_used == "llama3.1"
                assert tokens == 50


class TestCheckOllamaAvailable:
    """Tests for check_ollama_available method."""

    @pytest.mark.asyncio
    async def test_caches_availability_result(self, llm_service):
        """Test Ollama availability is cached for 60 seconds."""
        # Set cached result
        llm_service._ollama_available = True
        llm_service._ollama_check_time = 999999999999  # Far future

        result = await llm_service.check_ollama_available()

        assert result is True
        # Should use cached value, not make new request

    @pytest.mark.asyncio
    async def test_returns_false_on_connection_error(self, llm_service):
        """Test returns False when Ollama connection fails."""
        # Reset cache
        llm_service._ollama_available = None
        llm_service._ollama_check_time = 0

        with patch("ollama.AsyncClient") as mock_client:
            mock_instance = MagicMock()
            mock_instance.list = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client.return_value = mock_instance

            result = await llm_service.check_ollama_available()

            assert result is False


class TestTokenCounting:
    """Tests for token counting functionality."""

    def test_count_tokens_with_tiktoken(self, llm_service):
        """Test token counting with tiktoken."""
        text = "Hello world, this is a test."
        count = llm_service._count_tokens(text)

        assert count > 0
        assert isinstance(count, int)

    def test_count_tokens_fallback_estimation(self, settings):
        """Test fallback token estimation when tiktoken unavailable."""
        service = LLMService(settings)
        service._tokenizer = None  # Force fallback

        text = "1234567890"  # 10 characters = ~2.5 tokens
        count = service._count_tokens(text)

        assert count == 2  # 10 // 4 = 2


class TestBuildUserContextMessage:
    """Tests for _build_user_context_message method."""

    def test_builds_context_with_all_fields(self, llm_service):
        """Test context string includes all provided fields."""
        context = ConversationContext(
            organization_name="Test Corp",
            tax_regime="601",
            rfc="ABC123456XY9",
            user_role="admin",
            monthly_revenue_approx=100000,
            employee_count_approx=50,
        )

        result = llm_service._build_user_context_message(context)

        assert "Test Corp" in result
        assert "601" in result
        assert "ABC123456XY9" in result
        assert "admin" in result
        assert "100,000" in result
        assert "50" in result

    def test_returns_empty_for_empty_context(self, llm_service):
        """Test returns empty string when no context provided."""
        context = ConversationContext()
        result = llm_service._build_user_context_message(context)

        assert result == ""

    def test_includes_regime_name(self, llm_service):
        """Test includes human-readable regime name."""
        context = ConversationContext(tax_regime="626")
        result = llm_service._build_user_context_message(context)

        assert "626" in result
        assert "RESICO" in result


class TestGenerateTitle:
    """Tests for generate_title method."""

    @pytest.mark.asyncio
    async def test_truncates_long_messages(self, llm_service):
        """Test title is truncated to 60 characters."""
        long_message = "This is a very long message that should definitely be truncated to fit within the title length limit"
        title = await llm_service.generate_title(long_message)

        assert len(title) <= 60
        assert title.endswith("...")

    @pytest.mark.asyncio
    async def test_keeps_short_messages(self, llm_service):
        """Test short messages are kept as-is."""
        short_message = "¿Qué es el IVA?"
        title = await llm_service.generate_title(short_message)

        assert title == "¿Qué es el IVA?"


class TestGenerateSummary:
    """Tests for generate_summary method."""

    @pytest.mark.asyncio
    async def test_returns_empty_for_empty_messages(self, llm_service):
        """Test returns empty string for empty message list."""
        summary = await llm_service.generate_summary([])

        assert summary == ""

    @pytest.mark.asyncio
    async def test_generates_summary_with_ollama(self, llm_service):
        """Test generates summary using LLM."""
        messages = [
            ChatMessage(role=MessageRole.USER, content="¿Qué es el IVA?"),
            ChatMessage(role=MessageRole.ASSISTANT, content="El IVA es un impuesto al consumo."),
        ]

        with patch.object(llm_service, "check_ollama_available", new_callable=AsyncMock, return_value=True):
            with patch.object(
                llm_service,
                "_call_ollama",
                new_callable=AsyncMock,
                return_value=("Resumen de la conversación sobre IVA.", None)
            ):
                summary = await llm_service.generate_summary(messages)

                assert "IVA" in summary
