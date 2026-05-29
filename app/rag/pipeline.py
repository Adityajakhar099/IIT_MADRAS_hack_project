from app.rag.retriever import search_documents
from app.rag.generator import generate_answer


def answer_query(query: str):
    """
    Full RAG pipeline
    """

    retrieval_results = search_documents(query=query, top_k=3)

    response = generate_answer(
        query=query,
        retrieval_results=retrieval_results
    )

    return response