"""
Generator Module for Traffic AI.

This module provides the context-building and answer generation functionality
using the Google Gemini API (gemini-1.5-flash model) based on retrieved
legal documents.
"""

import logging
import os
from typing import Any, Dict, List, Optional

# Configure logger
logger = logging.getLogger(__name__)

# Global cache variable for singleton-like reuse of the Gemini model
_model: Optional[Any] = None

SYSTEM_INSTRUCTION = (
    "You are an AI legal traffic compliance assistant.\n\n"
    "Rules:\n"
    "- Answer ONLY using provided legal context.\n"
    "- NEVER invent laws.\n"
    "- NEVER hallucinate legal sections.\n"
    "- NEVER invent penalties.\n"
    "- If the provided context does not contain enough information, say: "
    "\"No verified legal information found for this jurisdiction.\"\n"
    "- Explain clearly in citizen-friendly language.\n"
    "- Mention source document names when useful.\n"
    "- Keep answer concise but informative."
)

PROMPT_TEMPLATE = """Context:
{retrieved_context}

User Question:
{query}

Answer:"""


def load_gemini_model() -> Any:
    """
    Loads the GEMINI_API_KEY from environment variables/dotenv, and
    initializes the Gemini model (gemini-1.5-flash) with system instructions.

    Returns:
        google.generativeai.GenerativeModel: The initialized Gemini model instance.

    Raises:
        ValueError: If the GEMINI_API_KEY is missing.
        RuntimeError: If initialization fails.
    """
    global _model
    if _model is None:
        logger.info("Loading environment variables using python-dotenv...")
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except Exception as e:
            logger.error(f"Failed to load environment variables: {e}")
            raise RuntimeError(f".env loading failure: {e}") from e

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            error_msg = "GEMINI_API_KEY not found in environment or .env file."
            logger.error(error_msg)
            raise ValueError(error_msg)

        logger.info("Initializing Gemini model...")
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            
            # Determine appropriate model name (handle deprecations/newer models in the environment)
            model_name = "gemini-1.5-flash"
            try:
                available_models = [m.name for m in genai.list_models()]
                available_names = [name.replace("models/", "") for name in available_models]
                if model_name not in available_names:
                    # Fallback hierarchy for flash models
                    fallback_candidates = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
                    for candidate in fallback_candidates:
                        if candidate in available_names:
                            logger.warning(f"Model '{model_name}' not available. Falling back to '{candidate}'.")
                            model_name = candidate
                            break
            except Exception as le:
                logger.warning(f"Could not check available models, attempting default '{model_name}': {le}")

            _model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=SYSTEM_INSTRUCTION
            )
            logger.info(f"Gemini model '{model_name}' initialized successfully.")
        except Exception as e:
            error_msg = f"Gemini initialization failure: {e}"
            logger.error(error_msg)
            raise RuntimeError(error_msg) from e

    return _model


def build_context(results: dict) -> str:
    """
    Converts retriever results into a clean, formatted context string.

    Args:
        results (dict): The results returned by search_documents.

    Returns:
        str: A formatted context string containing sources and content.
    """
    if not results or "results" not in results or not results["results"]:
        logger.info("No retriever results available to build context.")
        return ""

    context_parts = []
    for idx, res in enumerate(results["results"], 1):
        doc = res.get("document", "").strip()
        metadata = res.get("metadata") or {}
        source = metadata.get("source", "Unknown Source")
        
        context_parts.append(f"Source: {source}\nContent:\n{doc}")

    formatted_context = "\n\n".join(context_parts)
    logger.info("Retrieval context built and formatted.")
    return formatted_context


def generate_answer(query: str, retrieval_results: dict) -> Dict[str, Any]:
    """
    Generates a legal traffic compliance answer using Gemini based on retrieval context.

    Args:
        query (str): The user question.
        retrieval_results (dict): The document search results from retriever.py.

    Returns:
        Dict[str, Any]: A structured response containing the query, the generated answer,
                        and the list of unique source documents used.
                        Format:
                        {
                           "query": str,
                           "answer": str,
                           "sources": list[str]
                        }

    Raises:
        ValueError: If query or retrieval_results inputs are invalid.
        RuntimeError: If model initialization or API generation fails.
    """
    # Validate inputs
    if not query or not isinstance(query, str) or not query.strip():
        error_msg = "Query must be a non-empty string."
        logger.error(error_msg)
        raise ValueError(error_msg)

    if not isinstance(retrieval_results, dict):
        error_msg = "Retrieval results must be a dictionary."
        logger.error(error_msg)
        raise ValueError(error_msg)

    # Extract unique source names from the retrieval results
    sources = []
    if "results" in retrieval_results and retrieval_results["results"]:
        for res in retrieval_results["results"]:
            metadata = res.get("metadata") or {}
            source = metadata.get("source")
            if source and source not in sources:
                sources.append(source)

    # If retrieval results are empty, short-circuit to fallback answer (avoiding API cost)
    if not retrieval_results.get("results"):
        logger.info("Empty retrieval results list. Returning fallback answer directly.")
        return {
            "query": query,
            "answer": "No verified legal information found for this jurisdiction.",
            "sources": []
        }

    # Initialize model
    model = load_gemini_model()

    # Build context and prompt
    logger.info("Generating prompt for generation...")
    retrieved_context = build_context(retrieval_results)
    prompt = PROMPT_TEMPLATE.format(retrieved_context=retrieved_context, query=query.strip())

    logger.info("Generation started. Sending request to Gemini API...")
    try:
        response = model.generate_content(prompt)
        if not response.candidates:
            raise ValueError("Gemini API returned no candidate responses.")
            
        answer = response.text.strip()
        logger.info("Generation completed successfully.")
        
        return {
            "query": query,
            "answer": answer,
            "sources": sources
        }
    except Exception as e:
        error_msg = f"Gemini generation API call failed: {e}"
        logger.error(error_msg)
        raise RuntimeError(error_msg) from e
