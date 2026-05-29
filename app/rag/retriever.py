"""
Retriever Module for Traffic AI.

This module provides the semantic search functionality for retrieving legal
document chunks from ChromaDB using sentence-transformer embeddings.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import chromadb
from sentence_transformers import SentenceTransformer

# Configure logger
logger = logging.getLogger(__name__)

# Global cache variables for singleton-like reuse
_embedding_model: Optional[SentenceTransformer] = None
_chroma_client: Optional[chromadb.PersistentClient] = None
_collection: Optional[chromadb.Collection] = None

# Default paths and names
# Try current working directory first, fallback to module-relative path
if os.path.exists("vectordb"):
    DEFAULT_DB_PATH = os.path.abspath("vectordb")
else:
    DEFAULT_DB_PATH = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "vectordb")
    )

DEFAULT_COLLECTION_NAME = "traffic_rules"
DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"


def load_embedding_model(model_name: str = DEFAULT_MODEL_NAME) -> SentenceTransformer:
    """
    Loads and caches the SentenceTransformer model.

    This function ensures that the embedding model is initialized only once
    and is reused for subsequent calls, optimizing query performance.

    Args:
        model_name (str): The name of the sentence-transformers model to load.
                          Defaults to 'all-MiniLM-L6-v2'.

    Returns:
        SentenceTransformer: The loaded embedding model instance.

    Raises:
        RuntimeError: If loading the model fails.
    """
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model '{model_name}'...")
        try:
            _embedding_model = SentenceTransformer(model_name)
            logger.info(f"Embedding model '{model_name}' loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load embedding model '{model_name}': {e}")
            raise RuntimeError(f"Failed to load embedding model '{model_name}': {e}") from e
    return _embedding_model


def get_collection(
    db_path: str = DEFAULT_DB_PATH, collection_name: str = DEFAULT_COLLECTION_NAME
) -> chromadb.Collection:
    """
    Connects to the persistent ChromaDB storage and retrieves the collection.

    This function verifies that the database path exists and that the specified
    collection is already created and present. It raises a clear error if the
    collection is missing.

    Args:
        db_path (str): The persistent storage path of ChromaDB.
        collection_name (str): The name of the collection to load.

    Returns:
        chromadb.Collection: The loaded ChromaDB collection instance.

    Raises:
        FileNotFoundError: If the ChromaDB persistent directory does not exist.
        ValueError: If the collection does not exist in ChromaDB.
        RuntimeError: For other general database connection failures.
    """
    global _chroma_client, _collection
    if _collection is None:
        logger.info(f"Connecting to ChromaDB at: {db_path}")
        
        # Verify the database directory exists
        if not os.path.exists(db_path):
            error_msg = f"ChromaDB persistent directory not found at path: {db_path}"
            logger.error(error_msg)
            raise FileNotFoundError(error_msg)
            
        try:
            _chroma_client = chromadb.PersistentClient(path=db_path)
            
            # Check existing collections
            collections = [col.name for col in _chroma_client.list_collections()]
            if collection_name not in collections:
                error_msg = (
                    f"Collection '{collection_name}' not found in ChromaDB. "
                    f"Available collections: {collections}. Please run ingestion first."
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
                
            _collection = _chroma_client.get_collection(name=collection_name)
            logger.info(f"Collection '{collection_name}' loaded successfully.")
            
        except (FileNotFoundError, ValueError):
            # Re-raise explicit exceptions
            raise
        except Exception as e:
            error_msg = f"ChromaDB connection or retrieval error: {e}"
            logger.error(error_msg)
            raise RuntimeError(error_msg) from e
            
    return _collection


def embed_query(query: str) -> List[float]:
    """
    Converts a natural language query into a vector embedding.

    Args:
        query (str): The search query.

    Returns:
        List[float]: The dense vector embedding representation of the query.

    Raises:
        ValueError: If the query is empty or invalid.
        RuntimeError: If embedding generation fails.
    """
    if not query or not isinstance(query, str) or not query.strip():
        error_msg = "Query must be a non-empty string."
        logger.error(error_msg)
        raise ValueError(error_msg)
        
    # Get model and encode
    model = load_embedding_model()
    try:
        query_cleaned = query.strip()
        logger.info(f"Generating embedding for query: '{query_cleaned}'")
        embedding = model.encode(query_cleaned)
        return embedding.tolist()
    except Exception as e:
        error_msg = f"Failed to encode query '{query}': {e}"
        logger.error(error_msg)
        raise RuntimeError(error_msg) from e


def search_documents(query: str, top_k: int = 5) -> Dict[str, Any]:
    """
    Executes the full semantic search pipeline.

    Takes a natural language query, generates its vector embedding, queries
    ChromaDB for the most similar document chunks, and formats the results.

    Args:
        query (str): The user search query.
        top_k (int): Number of top results to retrieve. Defaults to 5.

    Returns:
        Dict[str, Any]: A structured response containing the query and the results.
                        Format:
                        {
                            "query": str,
                            "results": [
                                {
                                    "document": str,
                                    "metadata": dict,
                                    "id": str,
                                    "distance": float
                                },
                                ...
                            ]
                        }

    Raises:
        ValueError: If top_k is invalid or query validation fails.
        RuntimeError: For errors during embedding or querying steps.
    """
    if top_k <= 0:
        error_msg = f"top_k must be a positive integer. Got: {top_k}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Starting semantic search for query: '{query}' with top_k={top_k}")
    
    # 1. Embed query
    query_vector = embed_query(query)
    
    # 2. Connect/load collection
    collection = get_collection()
    
    # 3. Query ChromaDB
    try:
        logger.info(f"Querying ChromaDB collection for top_k={top_k}...")
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=top_k
        )
        logger.info("Search successfully completed.")
    except Exception as e:
        error_msg = f"ChromaDB query operation failed: {e}"
        logger.error(error_msg)
        raise RuntimeError(error_msg) from e

    # 4. Format outputs in a predictable JSON-friendly structure
    formatted_results = []
    
    if results and "documents" in results and results["documents"]:
        documents = results["documents"][0]
        metadatas = results.get("metadatas", [[]])[0] or [None] * len(documents)
        ids = results.get("ids", [[]])[0] or [None] * len(documents)
        distances = results.get("distances", [[]])[0] or [None] * len(documents)
        
        for i in range(len(documents)):
            # Ensure distance is a native Python float
            dist_val = None
            if distances and i < len(distances) and distances[i] is not None:
                dist_val = float(distances[i])
                
            formatted_results.append({
                "document": documents[i],
                "metadata": metadatas[i] if (metadatas and i < len(metadatas)) else {},
                "id": ids[i] if (ids and i < len(ids)) else f"doc_{i}",
                "distance": dist_val
            })
            
    return {
        "query": query,
        "results": formatted_results
    }
