from pypdf import PdfReader
import os


def extract_text_from_pdf(pdf_path: str):
    """
    Extract text from PDF file
    """
    try:
        reader = PdfReader(pdf_path)
        text = ""

        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"

        return text

    except Exception as e:
        print(f"Error reading PDF: {e}")
        return None


def clean_text(text: str):
    """
    Basic text cleaning
    """
    if not text:
        return ""

    text = text.replace("\n", " ")
    text = text.replace("\t", " ")
    text = " ".join(text.split())

    return text