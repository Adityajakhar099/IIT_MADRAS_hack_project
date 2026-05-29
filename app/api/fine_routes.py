import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from app.services.fine_engine import calculate_fine

# Configure logger
logger = logging.getLogger("fine_routes")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/fine", tags=["Fine Calculator"])

class FineCalculationRequest(BaseModel):
    state: str = Field(..., description="The name of the state, e.g., 'Rajasthan' or 'Maharashtra'")
    vehicle_type: str = Field(..., description="The type of the vehicle, e.g., 'Bike', 'Car', 'Heavy Vehicle'")
    violation: str = Field(..., description="The traffic violation description, e.g., 'No Helmet'")
    repeat_offense: bool = Field(False, description="Flag indicating if it is a repeat offense")

    @field_validator('state', 'vehicle_type', 'violation')
    @classmethod
    def validate_non_empty_strings(cls, v: str, info) -> str:
        """Ensures that string parameters are not empty or purely whitespace."""
        if not v or not v.strip():
            raise ValueError(f"{info.field_name} cannot be empty or only whitespace.")
        return v.strip()

class FineCalculationResponse(BaseModel):
    state: str
    vehicle_type: str
    violation: str
    law_section: str
    fine: int
    repeat_offense: bool
    license_suspension: str

@router.post("/calculate", response_model=FineCalculationResponse, summary="Calculate Traffic Fine")
def calculate_fine_endpoint(request: FineCalculationRequest):
    """
    Calculates the traffic fine based on state, vehicle type, violation, and repeat offense status.
    Uses a deterministic rule engine with fuzzy matching for violations.
    """
    logger.info(
        f"Received fine calculation request: state={request.state}, "
        f"vehicle_type={request.vehicle_type}, violation={request.violation}, "
        f"repeat_offense={request.repeat_offense}"
    )
    
    try:
        result = calculate_fine(
            state=request.state,
            vehicle_type=request.vehicle_type,
            violation=request.violation,
            repeat_offense=request.repeat_offense
        )
        return result
        
    except FileNotFoundError as e:
        logger.error(f"Rule database file not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
        
    except ValueError as e:
        err_msg = str(e)
        logger.warning(f"Validation or matching error during calculation: {err_msg}")
        
        # Map specific ValueError messages to appropriate HTTP Status codes
        if "not supported" in err_msg or "is not supported" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        elif "is invalid" in err_msg or "invalid" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        elif "not applicable" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        elif "Unknown violation" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err_msg
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
            
    except Exception as e:
        logger.error(f"Unexpected error in calculate_fine_endpoint: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected internal error occurred: {str(e)}"
        )
