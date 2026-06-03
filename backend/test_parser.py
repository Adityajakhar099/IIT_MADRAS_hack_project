from app.utils.parser import extract_text_from_pdf, clean_text

pdf_path = "data/raw/traffic_rules.pdf"

text = extract_text_from_pdf(pdf_path)

if text:
    cleaned = clean_text(text)
    print(cleaned[:2000])
else:
    print("Failed to extract text")