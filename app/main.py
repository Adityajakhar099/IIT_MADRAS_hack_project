from fastapi import FastAPI
from app.api.routes import router
from app.api.fine_routes import router as fine_router
from app.api.challan_routes import router as challan_router

app = FastAPI(
    title="Traffic AI RAG Service"
)

app.include_router(router)
app.include_router(fine_router)
app.include_router(challan_router)


@app.get("/")
def home():
    return {
        "message": "Traffic AI running"
    }