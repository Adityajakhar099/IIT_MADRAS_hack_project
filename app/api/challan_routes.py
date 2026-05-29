import os
import uuid
import shutil
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from pydantic import BaseModel
from app.services.ocr_service import extract_text_from_image, extract_text_from_pdf
from app.services.challan_parser import parse_challan_details, generate_challan_explanation

# Configure logger
logger = logging.getLogger("challan_routes")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/challan", tags=["Challan Analyzer"])

class ChallanAnalysisResponse(BaseModel):
    vehicle_number: str
    violation: str
    fine_amount: str
    authority: str
    date: str
    location: str
    explanation: str

@router.post("/analyze", response_model=ChallanAnalysisResponse, summary="Analyze Traffic Challan (Image/PDF)")
async def analyze_challan(file: UploadFile = File(..., description="Upload a challan image (JPG, PNG) or PDF document")):
    """
    Accepts a challan image or PDF file. 
    1. Saves the uploaded file temporarily.
    2. Runs OCR to extract text (handles digital/scanned PDFs and images).
    3. Heuristically parses violation, fine amount, vehicle, authority, date, and location.
    4. Automatically queries Gemini to generate a citizen-friendly explanation.
    5. Cleans up all temporary files before returning the response.
    """
    logger.info(f"Received challan upload request: filename={file.filename}, content_type={file.content_type}")
    
    # 1. Validate file extension
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension not in [".jpg", ".jpeg", ".png", ".pdf"]:
        logger.error(f"Rejected upload with unsupported file extension: {extension}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{extension}'. Supported formats are: JPG, JPEG, PNG, PDF."
        )
        
    # 2. Setup temporary folder and file path
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    temp_dir = os.path.join(base_dir, "data", "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_filename = f"{uuid.uuid4()}{extension}"
    temp_file_path = os.path.join(temp_dir, temp_filename)
    
    # 3. Save uploaded file to the temporary path
    logger.info(f"Saving temporary upload to: {temp_file_path}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as save_err:
        logger.error(f"Failed to save temporary upload: {save_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file on server."
        )
        
    # 4. Process the file and clean up in finally block
    try:
        # Run OCR extraction
        if extension == ".pdf":
            ocr_result = extract_text_from_pdf(temp_file_path)
        else:
            ocr_result = extract_text_from_image(temp_file_path)
            
        extracted_text = ocr_result["text"]
        confidence = ocr_result["confidence"]
        
        # Log the OCR Confidence (bonus requirement)
        logger.info(f"OCR execution completed for {file.filename}. Average confidence score: {confidence:.2f}")
        
        if not extracted_text.strip():
            logger.warning("OCR failed to extract any readable text from the uploaded document.")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not extract any text from the uploaded file. Please make sure the image or PDF is clear and legible."
            )
            
        # Parse details heuristically
        parsed_data = parse_challan_details(extracted_text)
        
        # Generate citizen-friendly explanation using Gemini
        explanation = generate_challan_explanation(parsed_data)
        
        # Build structured response
        response_data = {
            "vehicle_number": parsed_data["vehicle_number"],
            "violation": parsed_data["violation"],
            "fine_amount": parsed_data["fine_amount"],
            "authority": parsed_data["authority"],
            "date": parsed_data["date"],
            "location": parsed_data["location"],
            "explanation": explanation
        }
        
        logger.info(f"Successfully processed challan for vehicle {parsed_data['vehicle_number']}.")
        return response_data
        
    except HTTPException:
        # Re-raise standard FastAPI HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Internal processing failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while processing the challan: {str(e)}"
        )
    finally:
        # Cleanup temporary files (bonus requirement)
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Successfully deleted temporary file: {temp_file_path}")
            except Exception as cleanup_err:
                logger.warning(f"Failed to delete temporary file {temp_file_path}: {cleanup_err}")
