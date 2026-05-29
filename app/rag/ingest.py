import os
import glob

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb

from app.utils.parser import extract_text_from_pdf, clean_text

CHROMA_DB_PATH = "vectordb"
COLLECTION_NAME = "traffic_rules"


def get_chroma_collection():
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME
    )

    return collection


def process_pdf(pdf_path):
    print(f"\nProcessing: {pdf_path}")

    raw_text = extract_text_from_pdf(pdf_path)

    if not raw_text:
        print("No text extracted.")
        return []

    cleaned_text = clean_text(raw_text)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )

    chunks = splitter.split_text(cleaned_text)

    print(f"Created {len(chunks)} chunks")

    return chunks


def create_embeddings(chunks):
    print("Loading embedding model...")

    model = SentenceTransformer("all-MiniLM-L6-v2")

    embeddings = model.encode(chunks)

    return embeddings


def store_in_chroma(chunks, embeddings, source_file):
    collection = get_chroma_collection()

    ids = []
    metadatas = []

    for i, chunk in enumerate(chunks):
        ids.append(f"{source_file}_{i}")

        metadatas.append({
            "source": source_file
        })

    collection.add(
        documents=chunks,
        embeddings=embeddings.tolist(),
        metadatas=metadatas,
        ids=ids
    )

    print(f"Stored {len(chunks)} chunks from {source_file}")


def ingest_all_pdfs():
    pdf_files = glob.glob("data/raw/*.pdf")

    if not pdf_files:
        print("No PDFs found in data/raw/")
        return

    print(f"Found {len(pdf_files)} PDFs")

    model = SentenceTransformer("all-MiniLM-L6-v2")

    for pdf_path in pdf_files:
        source_file = os.path.basename(pdf_path)

        chunks = process_pdf(pdf_path)

        if not chunks:
            continue

        embeddings = model.encode(chunks)

        store_in_chroma(chunks, embeddings, source_file)

    print("\nAll PDFs ingested successfully!")


if __name__ == "__main__":
    ingest_all_pdfs()