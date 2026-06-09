"""
Test script for the Traffic AI RAG Retriever layer.

This script tests the search_documents functionality. If the ChromaDB database
or collection is missing, it creates and seeds a mock database with realistic
traffic rules to ensure semantic search returns meaningful results.
"""

import logging
import os
import sys

# Configure logging to match expected output format
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Ensure current directory is in Python path to import app module
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

import chromadb
from app.rag.retriever import (
    DEFAULT_DB_PATH,
    DEFAULT_COLLECTION_NAME,
    search_documents,
    get_gemini_embedding
)


def seed_mock_database():
    """
    Seeds the ChromaDB database with sample traffic law documents if it doesn't exist
    or if the collection is empty.
    """
    # Create database directory if it doesn't exist
    if not os.path.exists(DEFAULT_DB_PATH):
        os.makedirs(DEFAULT_DB_PATH)
        
    client = chromadb.PersistentClient(path=DEFAULT_DB_PATH)
    
    # Try to see if collection exists and has elements
    try:
        collection = client.get_collection(name=DEFAULT_COLLECTION_NAME)
        if collection.count() > 0:
            # Collection exists and is populated, no seeding needed
            return
    except Exception:
        # Collection does not exist, we will create and seed it
        pass
        
    logger.info("ChromaDB collection is missing or empty. Seeding mock traffic rules...")
    collection = client.get_or_create_collection(name=DEFAULT_COLLECTION_NAME)
    
    # We will generate embeddings using the Gemini embedding API
    
    # Representative document chunks for Indian traffic rules
    documents = [
        "Helmet use is mandatory for all two-wheeler riders in Rajasthan. Under Section 129 of the Motor Vehicles Act, driving without a helmet attracts a fine of Rs. 1000 and license suspension for 3 months.",
        "Under Section 185 of the Motor Vehicles Act, the law for drunk driving in India states that driving with alcohol content exceeding 30 mg per 100 ml of blood is punishable with a fine of Rs. 10,000 or up to 6 months imprisonment.",
        "In Delhi, jumping a red light signal attracts a penalty of Rs. 5000 and a compulsory three-month license suspension for the first offense.",
        "Speed limit near school zones is restricted to 20 km/h in Chennai. Violations are heavily penalized, attracting a fine of Rs. 2000 for dangerous driving.",
        "Not wearing a seatbelt attracts a fine of Rs. 1000 for the first offense. Repeat offense penalty for no seatbelt is doubled to Rs. 2000 under the Motor Vehicles (Amendment) Act.",
        "General penalties for driving without a valid license start at Rs. 5000 under Section 181 of the Motor Vehicles Act."
    ]
    
    metadatas = [
        {"source": "rajasthan_rules.pdf"},
        {"source": "india_motor_act.pdf"},
        {"source": "delhi_rules.pdf"},
        {"source": "chennai_rules.pdf"},
        {"source": "seatbelt_rules.pdf"},
        {"source": "india_motor_act.pdf"}
    ]
    
    ids = [
        "rajasthan_rules_1",
        "india_motor_act_drunk",
        "delhi_signal_1",
        "chennai_speed_1",
        "seatbelt_fine_1",
        "india_motor_act_license"
    ]
    
    # Generate embeddings
    embeddings = [get_gemini_embedding(doc, is_document=True) for doc in documents]
    
    # Add to ChromaDB
    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids,
        embeddings=embeddings
    )
    logger.info("Mock database seeded successfully.\n")


def run_tests():
    """
    Runs tests on the retriever layer.
    """
    # 1. Ensure database exists and is seeded
    seed_mock_database()
    
    # 2. Define test query
    test_query = "Helmet fine in Rajasthan"
    
    try:
        # Run search
        search_response = search_documents(query=test_query, top_k=2)
        
        # Print formatted results to console
        print("")  # Newline for cleaner output
        for i, res in enumerate(search_response["results"], 1):
            doc_snippet = res["document"]
            source = res["metadata"].get("source", "unknown")
            distance = res["distance"]
            
            print(f"Result {i}:")
            print(f"Document: {doc_snippet}")
            print(f"Source: {source}")
            if distance is not None:
                print(f"Distance: {distance:.2f}")
            print("")
            
    except Exception as e:
        logger.error(f"Test run failed with error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_tests()