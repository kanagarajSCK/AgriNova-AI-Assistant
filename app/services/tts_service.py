"""Text-to-Speech Service using Groq TTS API.

Generates speech audio from text using Groq's Orpheus TTS model.
"""

import logging
import string
import random
import time
from pathlib import Path
from typing import Optional

import requests

from app.config import AppConfig

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-Speech service using Groq's audio/speech API.

    Uses the Orpheus TTS model via Groq for speech synthesis.
    """

    def __init__(self) -> None:
        """Initialize the TTS service."""
        self.config = AppConfig
        self.audio_folder: str = self.config.AUDIO_FOLDER
        self._endpoint = "https://api.groq.com/openai/v1/audio/speech"
        self._headers = {
            "Authorization": f"Bearer {self.config.GROQ_API_KEY}",
            "Content-Type": "application/json",
        }

        Path(self.audio_folder).mkdir(parents=True, exist_ok=True)
        logger.info("TTS initialized: %s (voice: %s)",
                     self.config.TTS_MODEL, self.config.TTS_VOICE)

    def synthesize(self, text: str, language_code: Optional[str] = None) -> Optional[str]:
        """Convert text to speech via Groq TTS or fallback gTTS.

        Args:
            text: The text to convert.
            language_code: Optional ISO 639-1 language code (e.g. 'ta', 'hi', 'te', 'kn', 'ml', 'en').

        Returns:
            Filename of the generated audio file, or None.
        """
        if not text or not text.strip():
            logger.warning("Empty text for TTS")
            return None

        # Determine language code if not provided
        if not language_code or language_code == "auto":
            language_code = self._detect_text_language(text)

        # For non-English languages, Groq's Orpheus English-only model is not suitable.
        # We MUST use gTTS to ensure native accents and accurate pronunciation.
        if language_code != "en":
            return self._synthesize_gtts(text, language_code)

        # Check if the provider is explicitly set to gTTS
        if getattr(self.config, 'TTS_PROVIDER', 'groq').lower() == 'gtts':
            return self._synthesize_gtts(text, language_code)

        if not self.config.GROQ_API_KEY:
            logger.warning("GROQ_API_KEY not set. Falling back to gTTS.")
            return self._synthesize_gtts(text, language_code)

        try:
            payload = {
                "model": self.config.TTS_MODEL,
                "input": text,
                "voice": self.config.TTS_VOICE,
                "response_format": "wav",
            }

            response = requests.post(
                self._endpoint,
                headers=self._headers,
                json=payload,
                timeout=30,
            )

            if response.status_code == 200:
                filename = self._generate_filename()
                filepath = Path(self.audio_folder) / filename
                with open(filepath, "wb") as f:
                    f.write(response.content)
                logger.debug("TTS saved: %s", filename)
                return filename
            else:
                logger.error("Groq TTS error %s: %s. Falling back to gTTS.",
                             response.status_code, response.text[:200])
                return self._synthesize_gtts(text, language_code)

        except requests.exceptions.Timeout:
            logger.error("Groq TTS timed out. Falling back to gTTS.")
            return self._synthesize_gtts(text, language_code)
        except Exception as exc:
            logger.error("TTS failed: %s. Falling back to gTTS.", exc)
            return self._synthesize_gtts(text, language_code)

    def _detect_text_language(self, text: str) -> str:
        """Helper to detect language code from text using Unicode character ranges."""
        for char in text:
            val = ord(char)
            if 0x0B80 <= val <= 0x0BFF:
                return "ta"  # Tamil
            elif 0x0900 <= val <= 0x097F:
                return "hi"  # Hindi (Devanagari)
            elif 0x0C00 <= val <= 0x0C7F:
                return "te"  # Telugu
            elif 0x0C80 <= val <= 0x0CFF:
                return "kn"  # Kannada
            elif 0x0D00 <= val <= 0x0D7F:
                return "ml"  # Malayalam
        return "en"

    def _synthesize_gtts(self, text: str, lang_code: Optional[str] = None) -> Optional[str]:
        """Convert text to speech via Google TTS (gTTS) library."""
        try:
            from gtts import gTTS
            filename = self._generate_filename().replace(".wav", ".mp3")
            filepath = Path(self.audio_folder) / filename

            # Automatically select language if not explicitly provided
            if not lang_code:
                lang_code = self._detect_text_language(text)

            tts = gTTS(text=text, lang=lang_code)
            tts.save(str(filepath))
            logger.info("gTTS successfully synthesized fallback audio: %s (lang: %s)", filename, lang_code)
            return filename
        except Exception as exc:
            logger.error("gTTS synthesis failed: %s", exc)
            return None

    @staticmethod
    def _generate_filename() -> str:
        """Generate a random .wav filename."""
        rand = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        return f"{rand}.wav"

    def cleanup_old_files(self, max_age_hours: int = 24) -> int:
        """Remove audio files older than max_age_hours."""
        cutoff = time.time() - (max_age_hours * 3600)
        cleaned = 0
        try:
            for ext in ("*.wav", "*.mp3"):
                for f in Path(self.audio_folder).glob(ext):
                    if f.stat().st_mtime < cutoff:
                        f.unlink()
                        cleaned += 1
            if cleaned:
                logger.info("Cleaned %d old audio files", cleaned)
        except Exception as exc:
            logger.error("Audio cleanup failed: %s", exc)
        return cleaned