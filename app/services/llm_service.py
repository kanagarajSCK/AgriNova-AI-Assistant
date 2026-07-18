"""LLM Service using Groq SDK for prompt-cached agricultural advisory.

Uses the Groq Python SDK directly (not LangChain) to enable
automatic prompt caching with cache hit rate tracking.

Prompt caching is automatic on Groq for supported models.
Static prefixes (system prompt + history) are cached across requests.
50% cost discount on cached tokens.
"""

import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

import groq

from app.config import AppConfig
from app.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


def strip_markdown(text: str) -> str:
    """Remove markdown formatting from LLM output.

    Strips bold (**), italic (*), headers (#), backticks, etc.
    This is a safety net in case the model ignores the prompt instruction.
    """
    if not text:
        return text

    # Remove bold: **text** → text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Remove italic: *text* → text
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
    # Remove underscores: _text_ → text
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text)
    # Remove headers: ### text → text
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove backticks: `text` → text
    text = re.sub(r'`([^`\n]+)`', r'\1', text)
    # Remove triple backtick blocks
    text = re.sub(r'```[\s\S]*?```', '', text)

    return text.strip()


def clean_reasoning(text: str) -> str:
    """Remove internal reasoning, chain-of-thought, and <think> blocks from LLM output."""
    if not text:
        return text

    # 1. Remove complete <think>...</think> blocks
    text = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE)
    # Handle unclosed <think> tags
    text = re.sub(r'<think>[\s\S]*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^[\s\S]*?</think>', '', text, flags=re.IGNORECASE)

    # 2. Filter out lines that are clearly internal reasoning
    reasoning_patterns = [
        r"^\s*here's a thinking process",
        r"^\s*thinking process",
        r"^\s*the user wants me to",
        r"^\s*i need to act as",
        r"^\s*let's analyze",
        r"^\s*check against constraints",
        r"^\s*output generation",
        r"^\s*analyze user input",
        r"^\s*image analysis",
        r"^\s*apply system guidelines",
        r"^\s*draft construction",
        r"^\s*verification steps",
        r"^\s*self-correction",
        r"^\s*user query analysis",
        r"^\s*internal reasoning",
        r"^\s*let's look at the image",
        r"^\s*i should identify",
        r"^\s*i will analyze",
    ]

    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        is_reasoning = False
        for pattern in reasoning_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                is_reasoning = True
                break
        if not is_reasoning:
            cleaned_lines.append(line)

    text = '\n'.join(cleaned_lines).strip()

    # 3. If the text contains key agricultural sections, strip any remaining reasoning prefix
    key_sections = [
        "what i see",
        "diagnosis",
        "cause",
        "solution",
        "prevention",
        "confidence level"
    ]
    
    earliest_idx = -1
    for sec in key_sections:
        match = re.search(r'(?:^|\b|\n)(?:-\s*|\d+\.\s*)?' + re.escape(sec), text, re.IGNORECASE)
        if match:
            idx = match.start()
            if earliest_idx == -1 or idx < earliest_idx:
                earliest_idx = idx

    if earliest_idx > 0:
        prefix = text[:earliest_idx].lower()
        if any(word in prefix for word in ["think", "reason", "analyze", "user wants", "guideline", "constraint", "draft"]):
            text = text[earliest_idx:].strip()

    return text


@dataclass
class LLMResult:
    """Response wrapper including cache metrics."""
    text: str
    prompt_tokens: int = 0
    cached_tokens: int = 0
    completion_tokens: int = 0

    @property
    def cache_hit_rate(self) -> float:
        """Percentage of prompt tokens served from cache."""
        if self.prompt_tokens == 0:
            return 0.0
        return (self.cached_tokens / self.prompt_tokens) * 100


class LLMService:
    """Service for LLM interaction via Groq SDK with prompt caching.

    Prompt caching works automatically when the static prefix
    (system prompt + conversation history) is consistent across requests.
    Only the new user query changes, maximizing cache hits.
    """

    def __init__(self) -> None:
        """Initialize the LLM service."""
        self.config = AppConfig
        self.prompt_manager = PromptManager()
        self._client = self._create_client()
        logger.info("LLM Service initialized (model: %s)", self.config.LLM_MODEL)

    def _create_client(self) -> Optional[groq.Groq]:
        """Create the Groq client."""
        api_key = self.config.GROQ_API_KEY
        if not api_key:
            logger.warning("GROQ_API_KEY not set. LLM unavailable.")
            return None
        return groq.Groq(api_key=api_key)

    def generate(
        self,
        user_query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        session_id: Optional[str] = None,
        target_language: Optional[str] = None,
    ) -> LLMResult:
        """Generate a response with cache hit tracking.

        Args:
            user_query: The farmer's input message.
            conversation_history: Prior messages from memory.
            session_id: Session ID for logging.
            target_language: Optional target language display name.

        Returns:
            LLMResult with text and cache metrics.
        """
        if self._client is None:
            return LLMResult(text="LLM not configured. Set GROQ_API_KEY in .env.")

        try:
            messages = self.prompt_manager.build_messages(
                user_query=user_query,
                conversation_history=conversation_history,
            )

            if target_language:
                messages.insert(1, {
                    "role": "system",
                    "content": f"IMPORTANT: The user has selected or spoken in {target_language}. You MUST formulate your entire response in {target_language} language only. Maintain the language and do not use English or any other language except when translating technical terms."
                })

            logger.debug("LLM call [session: %s], messages=%d",
                         session_id, len(messages))

            response = self._client.chat.completions.create(
                model=self.config.LLM_MODEL,
                messages=messages,
                temperature=self.config.LLM_TEMPERATURE,
                max_tokens=self.config.LLM_MAX_TOKENS,
            )

            # Extract cache metrics from usage
            usage = response.usage
            cached_tokens = 0
            prompt_tokens = getattr(usage, 'prompt_tokens', 0)

            details = getattr(usage, 'prompt_tokens_details', None)
            if details and isinstance(details, dict):
                cached_tokens = details.get('cached_tokens', 0)
            elif details:
                cached_tokens = getattr(details, 'cached_tokens', 0)

            result = LLMResult(
                text=strip_markdown(response.choices[0].message.content.strip()),
                prompt_tokens=prompt_tokens,
                cached_tokens=cached_tokens,
                completion_tokens=getattr(usage, 'completion_tokens', 0),
            )

            logger.info(
                "LLM response [session: %s] — "
                "prompt: %d tokens, cached: %d (%.0f%% hit), "
                "completion: %d tokens",
                session_id,
                result.prompt_tokens,
                result.cached_tokens,
                result.cache_hit_rate,
                result.completion_tokens,
            )

            return result

        except Exception as exc:
            logger.error("LLM generation failed [session: %s]: %s",
                         session_id, exc)
            return LLMResult(
                text="I apologize, but I'm experiencing a temporary issue. "
                     "Please try again in a moment."
            )

    @property
    def client(self):
        """Access the underlying Groq client."""
        return self._client

    def generate_with_image(
        self,
        user_query: str,
        image_base64: str,
        image_mime: str = "image/jpeg",
        session_id: Optional[str] = None,
        target_language: Optional[str] = None,
    ) -> LLMResult:
        """Generate a response analyzing an image with the vision model.

        Uses Gemini API (gemini-2.5-flash) for multimodal input.
        The image is passed as base64 data URL.

        Args:
            user_query: The farmer's question about the image.
            image_base64: Base64 encoded image data.
            image_mime: MIME type (image/jpeg, image/png, etc).
            session_id: Session ID for logging.
            target_language: Optional target language display name.

        Returns:
            LLMResult with text and cache metrics.
        """
        import os
        import requests

        gemini_key = getattr(self.config, 'GEMINI_API_KEY', None) or os.getenv('GEMINI_API_KEY')
        if not gemini_key:
            logger.warning("GEMINI_API_KEY not set. Falling back to Groq vision model.")
            return self._generate_with_image_groq(user_query, image_base64, image_mime, session_id, target_language)

        try:
            # Use a highly optimized, concise system prompt specifically for the vision model
            vision_system_prompt = (
                "You are AgriNova AI, an AI-powered agricultural assistant developed by Kanagaraj S for Indian farmers. "
                "Your purpose is to analyze agricultural images and provide accurate, practical, and concise guidance.\n\n"
                "CRITICAL RULES:\n"
                "- Analyze only what is actually visible in the uploaded image.\n"
                "- First identify the main visible object or crop.\n"
                "- Do not invent objects that are not visible.\n"
                "- If the image is unclear, say so instead of guessing.\n"
                "- Do not diagnose a disease unless visible symptoms support the diagnosis.\n"
                "- Separate direct visual observations from possible diagnoses.\n"
                "- Use High confidence only when visual evidence is clear.\n"
                "- Output ONLY plain text. Never use Markdown, bold (**), italic (*), headers (#), or backticks.\n"
                "- Use short paragraphs and dashes (-) for lists.\n"
                "- Return only the final answer intended for the farmer. Do not output internal reasoning, chain-of-thought, analysis steps, self-correction, verification steps, draft construction, or <think> tags.\n\n"
                "The response must contain only these sections:\n"
                "What I see: [Identify the main visible object or crop]\n"
                "Diagnosis: [Name the specific problem based on visible symptoms, or state if healthy/unclear]\n"
                "Possible cause: [Explain what likely caused the issue based on visible evidence]\n"
                "Recommended action: [Give 2-3 specific, actionable remedies with product names, dosages, and application methods]\n"
                "Confidence level: [High, Medium, or Low]"
            )

            # Build the prompt
            prompt = vision_system_prompt
            if target_language:
                prompt += (
                    f"\n\nIMPORTANT: The user has selected or spoken in {target_language}. "
                    f"You MUST formulate your entire response in {target_language} language only. "
                    f"Translate all headers (such as 'What I see', 'Diagnosis', 'Possible cause', "
                    f"'Recommended action', 'Confidence level') and content into {target_language}. "
                    f"Maintain the language and do not use English or any other language except when translating technical terms."
                )
            prompt += f"\n\nUser Question: {user_query}"

            # Call Gemini API
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.config.LLM_VISION_MODEL or 'gemini-2.5-flash'}:generateContent?key={gemini_key}"
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {
                                "inlineData": {
                                    "mimeType": image_mime,
                                    "data": image_base64
                                }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "maxOutputTokens": 2048,
                    "temperature": 0.3
                }
            }

            logger.info("Calling Gemini API for vision analysis [session: %s]", session_id)
            response = requests.post(url, json=payload, timeout=60)

            if response.status_code == 200:
                res_json = response.json()
                raw_content = res_json["candidates"][0]["content"]["parts"][0]["text"].strip()
                
                # Apply robust fallback cleaning to remove any leaked reasoning/thinking blocks
                cleaned_content = clean_reasoning(raw_content)
                final_text = strip_markdown(cleaned_content)

                return LLMResult(
                    text=final_text,
                    prompt_tokens=res_json.get("usageMetadata", {}).get("promptTokenCount", 0),
                    cached_tokens=0,
                    completion_tokens=res_json.get("usageMetadata", {}).get("candidatesTokenCount", 0),
                )
            else:
                logger.error("Gemini API failed with status %s: %s", response.status_code, response.text)
                raise Exception(f"Gemini API returned status code {response.status_code}")

        except Exception as exc:
            logger.error("Gemini Vision LLM failed [session: %s]: %s. Falling back to Groq.", session_id, exc)
            return self._generate_with_image_groq(user_query, image_base64, image_mime, session_id, target_language)

    def _generate_with_image_groq(
        self,
        user_query: str,
        image_base64: str,
        image_mime: str = "image/jpeg",
        session_id: Optional[str] = None,
        target_language: Optional[str] = None,
    ) -> LLMResult:
        """Fallback method to generate response using Groq vision model if Gemini fails."""
        try:
            vision_system_prompt = (
                "You are AgriNova AI, an AI-powered agricultural assistant developed by Kanagaraj S for Indian farmers. "
                "Your purpose is to analyze agricultural images and provide accurate, practical, and concise guidance.\n\n"
                "CRITICAL RULES:\n"
                "- Analyze only what is actually visible in the uploaded image.\n"
                "- First identify the main visible object or crop.\n"
                "- Do not invent objects that are not visible.\n"
                "- If the image is unclear, say so instead of guessing.\n"
                "- Do not diagnose a disease unless visible symptoms support the diagnosis.\n"
                "- Separate direct visual observations from possible diagnoses.\n"
                "- Use High confidence only when visual evidence is clear.\n"
                "- Output ONLY plain text. Never use Markdown, bold (**), italic (*), headers (#), or backticks.\n"
                "- Use short paragraphs and dashes (-) for lists.\n"
                "- Return only the final answer intended for the farmer. Do not output internal reasoning, chain-of-thought, analysis steps, self-correction, verification steps, draft construction, or <think> tags.\n\n"
                "The response must contain only these sections:\n"
                "What I see: [Identify the main visible object or crop]\n"
                "Diagnosis: [Name the specific problem based on visible symptoms, or state if healthy/unclear]\n"
                "Possible cause: [Explain what likely caused the issue based on visible evidence]\n"
                "Recommended action: [Give 2-3 specific, actionable remedies with product names, dosages, and application methods]\n"
                "Confidence level: [High, Medium, or Low]"
            )

            messages = [
                {"role": "system", "content": vision_system_prompt},
            ]

            if target_language:
                messages.append({
                    "role": "system",
                    "content": f"IMPORTANT: The user has selected or spoken in {target_language}. You MUST formulate your entire response in {target_language} language only. Translate all headers (such as 'What I see', 'Diagnosis', 'Possible cause', 'Recommended action', 'Confidence level') and content into {target_language}. Maintain the language and do not use English or any other language except when translating technical terms."
                })

            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": user_query},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{image_mime};base64,{image_base64}"
                        },
                    },
                ],
            })

            vision_max_tokens = min(self.config.LLM_MAX_TOKENS, 512)
            # Use the known valid Groq vision model for fallback
            fallback_model = "qwen/qwen3.6-27b"
            response = self._client.chat.completions.create(
                model=fallback_model,
                messages=messages,
                temperature=self.config.LLM_TEMPERATURE,
                max_tokens=vision_max_tokens,
                reasoning_format="hidden",
            )

            usage = response.usage
            raw_content = response.choices[0].message.content.strip()
            cleaned_content = clean_reasoning(raw_content)
            final_text = strip_markdown(cleaned_content)

            return LLMResult(
                text=final_text,
                prompt_tokens=getattr(usage, 'prompt_tokens', 0),
                cached_tokens=0,
                completion_tokens=getattr(usage, 'completion_tokens', 0),
            )
        except Exception as exc:
            logger.error("Fallback Groq Vision LLM failed: %s", exc)
            return LLMResult(text="I could not analyze the image. Please try again.")
