import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI, OpenAIError
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 100
MAX_NOTES_CHARACTERS = 20_000
app = FastAPI(title="Study Buddy")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class StudyRequest(BaseModel):
    notes: str = Field(min_length=30, max_length=20_000)
    mode: Literal["summary", "quiz"]


class QuizQuestion(BaseModel):
    question: str
    choices: list[str] = Field(min_length=4, max_length=4)
    correct_answer: int = Field(ge=0, le=3)
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion] = Field(min_length=5, max_length=5)


@app.get("/")
async def home() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.post("/api/notes/extract")
async def extract_notes(file: UploadFile = File(...)) -> dict[str, str]:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".txt", ".pdf"}:
        raise HTTPException(
            status_code=400,
            detail="Choose a .txt or PDF file.",
        )

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The file is larger than 5 MB. Choose a smaller file.",
        )

    if extension == ".txt":
        try:
            notes = content.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise HTTPException(
                status_code=400,
                detail="The text file must use UTF-8 encoding.",
            ) from error
    else:
        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="This file does not appear to be a valid PDF.",
            )
        try:
            reader = PdfReader(BytesIO(content), strict=True)
            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported.",
                )
            if len(reader.pages) > MAX_PDF_PAGES:
                raise HTTPException(
                    status_code=400,
                    detail=f"PDFs can contain at most {MAX_PDF_PAGES} pages.",
                )
            notes = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except PdfReadError as error:
            logger.info("Could not read uploaded PDF")
            raise HTTPException(
                status_code=400,
                detail="Could not read this PDF. Try exporting it again.",
            ) from error

    notes = notes.strip()
    if not notes:
        raise HTTPException(
            status_code=400,
            detail="No readable text was found. Scanned PDFs are not supported yet.",
        )
    if len(notes) > MAX_NOTES_CHARACTERS:
        raise HTTPException(
            status_code=413,
            detail="The extracted text is over 20,000 characters. Upload a shorter file.",
        )

    return {"text": notes, "filename": Path(file.filename or "").name}


@app.post("/api/study")
async def study(request: StudyRequest) -> dict[str, object]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Set OPENAI_API_KEY in your .env file to enable AI features.",
        )

    if request.mode == "summary":
        instructions = (
            "Summarize the student's notes in clear, simple language. "
            "Use headings and bullet points. Do not add facts that are not in the notes."
        )
    else:
        instructions = (
            "Create exactly five multiple-choice questions based only on the student's notes. "
            "Each question must have exactly four choices, one correct answer, and a brief "
            "explanation. Return a JSON object with a 'questions' array. Each question must "
            "have 'question' (string), 'choices' (array of four strings), 'correct_answer' "
            "(zero-based index of the correct choice), and 'explanation' (string). "
            "Return JSON only."
        )

    client = AsyncOpenAI(api_key=api_key)
    try:
        response = await client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            instructions=instructions,
            input=request.notes,
            **(
                {"text": {"format": {"type": "json_object"}}}
                if request.mode == "quiz"
                else {}
            ),
        )
    except OpenAIError as error:
        logger.exception("OpenAI request failed")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not complete the request. Check the server logs.",
        ) from error
    finally:
        await client.close()

    if not response.output_text:
        raise HTTPException(status_code=502, detail="The AI returned an empty response.")

    if request.mode == "quiz":
        try:
            quiz = QuizResponse.model_validate_json(response.output_text)
        except ValueError as error:
            logger.exception("OpenAI returned an invalid quiz")
            raise HTTPException(
                status_code=502,
                detail="The AI returned an invalid quiz. Please try again.",
            ) from error
        return quiz.model_dump()

    return {"result": response.output_text}
