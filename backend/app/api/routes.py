from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.rag.pipeline import answer_query

router = APIRouter()


class ChatRequest(BaseModel):
    query: str


@router.post("/chat")
def chat(request: ChatRequest):
    try:
        result = answer_query(request.query)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
