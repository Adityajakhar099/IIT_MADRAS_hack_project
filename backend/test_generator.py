"""
Test script for the Traffic AI RAG Generator layer.

This script runs the full RAG pipeline: retrieves relevant documents for a
user query and generates a compliance answer using the Google Gemini API.
"""

import logging
import os
import sys

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Ensure current directory is in Python path to import app and test modules
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

# Import the seeding helper from retriever test script to ensure database exists
try:
    from test_retriever import seed_mock_database
    seed_mock_database()
except Exception as e:
    logger.warning(f"Could not run seed_mock_database: {e}")

from app.rag.retriever import search_documents
from app.rag.generator import generate_answer


def test_rag_pipeline():
    """
    Retrieves legal documents and generates an answer using Gemini.
    """
    query = "Helmet fine in Rajasthan"
    top_k = 3
    
    logger.info(f"Retrieving top {top_k} documents for query: '{query}'...")
    try:
        retrieval_results = search_documents(query=query, top_k=top_k)
    except Exception as e:
        logger.error(f"Failed to retrieve documents: {e}")
        sys.exit(1)

    logger.info("Generating compliance answer using Gemini API...")
    try:
        response = generate_answer(query=query, retrieval_results=retrieval_results)
        
        print("\n" + "=" * 50)
        print("FINAL ANSWER:")
        print(response["answer"])
        print("=" * 50)
        print("\nSOURCES:")
        if response["sources"]:
            for source in response["sources"]:
                print(f"- {source}")
        else:
            print("- None")
        print("=" * 50)
        
    except Exception as e:
        logger.error(f"Failed to generate answer: {e}")
        sys.exit(1)


if __name__ == "__main__":
    test_rag_pipeline()
