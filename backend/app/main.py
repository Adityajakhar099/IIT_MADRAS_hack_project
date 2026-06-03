import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.routes import router
from app.api.fine_routes import router as fine_router
from app.api.challan_routes import router as challan_router

app = FastAPI(
    title="Traffic AI RAG Service"
)

# Enable CORS for local development and API calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(fine_router)
app.include_router(challan_router)

# Setup path for production build of React frontend
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dist_dir = os.path.join(base_dir, "frontend", "dist")

if os.path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")


@app.get("/")
def home():
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "Traffic AI running. Frontend build not detected. Please run 'npm run build' inside the 'frontend/' folder to build the static React assets, or run 'npm run dev' to start the local Vite development server."
    }