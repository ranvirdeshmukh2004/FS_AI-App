"""
PDF Processing API Route

Handles PDF upload, text extraction, chunking, embedding, and storage in Qdrant.
"""

import logging
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.services.pdf_service import process_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdf", tags=["pdf"])


@router.post("/process")
async def process_pdf_upload(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    embedding_api_key: str = Form(...),
    doc_id: str = Form(None),
):
    """
    Upload and process a PDF: extract text → chunk → embed → store in Qdrant.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if not doc_id:
        doc_id = str(uuid.uuid4())

    try:
        pdf_bytes = await file.read()
        result = await process_pdf(
            pdf_bytes=pdf_bytes,
            filename=file.filename,
            session_id=session_id,
            doc_id=doc_id,
            embedding_api_key=embedding_api_key,
        )
        return result
    except Exception as e:
        logger.error("PDF processing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")
