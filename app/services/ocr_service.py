import os
import io
import logging
import cv2
import numpy as np
from PIL import Image
from pypdf import PdfReader
from paddleocr import PaddleOCR
from typing import Dict, Any

# Configure logger
logger = logging.getLogger("ocr_service")
logger.setLevel(logging.INFO)

# Global OCR engine singleton
_ocr_engine = None

def get_ocr_instance() -> PaddleOCR:
    """
    Initializes and returns the PaddleOCR instance.
    Utilizes a global singleton pattern to avoid loading weights on every call.
    """
    global _ocr_engine
    if _ocr_engine is None:
        logger.info("Initializing PaddleOCR engine (use_angle_cls=True, lang='en')...")
        try:
            # show_log=False keeps CLI logs clean
            _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            logger.info("PaddleOCR engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            raise RuntimeError(f"OCR Engine initialization failed: {e}") from e
    return _ocr_engine

def preprocess_image(image_path: str) -> np.ndarray:
    """
    Loads an image from path and applies grayscaling, denoising, and thresholding.
    
    Args:
        image_path: Path to the image file.
        
    Returns:
        np.ndarray: The preprocessed binary image.
    """
    logger.info(f"Preprocessing image: {image_path}")
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Invalid or unreadable image file: {image_path}")
        
    # 1. Grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # 2. Denoise (using Median Blur which preserves edges better for OCR than Gaussian)
    denoised = cv2.medianBlur(gray, 3)
    
    # 3. Thresholding (Otsu's Thresholding to binarize the image)
    _, thresholded = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return thresholded

def extract_text_from_image(image_path: str) -> Dict[str, Any]:
    """
    Preprocesses the image and extracts text using PaddleOCR.
    
    Args:
        image_path: Path to the image file.
        
    Returns:
        Dict[str, Any]: Contains 'text' (str) and 'confidence' (float).
    """
    try:
        binary_image = preprocess_image(image_path)
        ocr_engine = get_ocr_instance()
        
        logger.info("Running PaddleOCR on preprocessed image...")
        result = ocr_engine.ocr(binary_image, cls=True)
        
        text_lines = []
        confidences = []
        
        if result:
            for line in result:
                if line:
                    for box_info in line:
                        text, conf = box_info[1]
                        text_lines.append(text)
                        confidences.append(conf)
                        
        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        extracted_text = "\n".join(text_lines)
        
        logger.info(f"Image OCR complete. Confidence: {avg_confidence:.2f}")
        return {
            "text": extracted_text,
            "confidence": avg_confidence
        }
    except Exception as e:
        logger.error(f"Error in extract_text_from_image: {e}")
        raise RuntimeError(f"OCR image extraction failed: {str(e)}") from e

def extract_text_from_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    Extracts text from PDF files. If digital text exists, it retrieves it directly.
    Otherwise, extracts embedded images and runs OCR on them.
    
    Args:
        pdf_path: Path to the PDF file.
        
    Returns:
        Dict[str, Any]: Contains 'text' (str) and 'confidence' (float).
    """
    logger.info(f"Extracting text from PDF: {pdf_path}")
    try:
        reader = PdfReader(pdf_path)
        digital_text_parts = []
        
        # 1. Attempt digital text extraction
        for page in reader.pages:
            t = page.extract_text()
            if t:
                digital_text_parts.append(t.strip())
                
        digital_text = "\n".join(digital_text_parts)
        if len(digital_text.strip()) > 50:
            logger.info("Extracted digital text from PDF successfully.")
            return {
                "text": digital_text,
                "confidence": 1.0
            }
            
        # 2. Fallback to image extraction and OCR (Scanned PDF)
        logger.info("Digital text too short or empty. Fallback to OCR on page images...")
        ocr_engine = get_ocr_instance()
        text_lines = []
        confidences = []
        
        for page_num, page in enumerate(reader.pages):
            logger.info(f"Scanning PDF page {page_num + 1} images...")
            for img_idx, image_obj in enumerate(page.images):
                try:
                    img_bytes = image_obj.data
                    pil_img = Image.open(io.BytesIO(img_bytes))
                    pil_img = pil_img.convert("RGB") # Normalize color spaces
                    
                    # Convert PIL image to BGR numpy array for OpenCV
                    open_cv_image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                    
                    # Preprocess the extracted image
                    gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
                    denoised = cv2.medianBlur(gray, 3)
                    _, thresholded = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    
                    # Run OCR
                    result = ocr_engine.ocr(thresholded, cls=True)
                    if result:
                        for line in result:
                            if line:
                                for box_info in line:
                                    text, conf = box_info[1]
                                    text_lines.append(text)
                                    confidences.append(conf)
                except Exception as page_err:
                    logger.warning(f"Failed to process page {page_num} image {img_idx}: {page_err}")
                    continue
                    
        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        extracted_text = "\n".join(text_lines)
        logger.info(f"PDF OCR complete. Confidence: {avg_confidence:.2f}")
        return {
            "text": extracted_text,
            "confidence": avg_confidence
        }
    except Exception as e:
        logger.error(f"Error in extract_text_from_pdf: {e}")
        raise RuntimeError(f"OCR PDF extraction failed: {str(e)}") from e
