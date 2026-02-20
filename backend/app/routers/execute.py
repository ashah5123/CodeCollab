import subprocess
import sys
import tempfile
import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload

router = APIRouter(prefix="/execute", tags=["execute"])

TIMEOUT_SECONDS = 10
MAX_OUTPUT_BYTES = 50_000
SUPPORTED_LANGUAGES = {"python", "javascript", "sql"}


class ExecuteRequest(BaseModel):
    language: str = Field(min_length=1, max_length=20)
    code: str = Field(min_length=1, max_length=50_000)


def _run(cmd: list[str], input_text: str | None = None) -> dict:
    try:
        result = subprocess.run(
            cmd,
            input=input_text,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        stdout = result.stdout[:MAX_OUTPUT_BYTES]
        stderr = result.stderr[:MAX_OUTPUT_BYTES]
        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {TIMEOUT_SECONDS}s",
            "exit_code": -1,
        }


@router.post("")
def execute_code(
    body: ExecuteRequest,
    user: JWTPayload = Depends(get_current_user),
):
    lang = body.language.lower()
    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{lang}'. Supported: {sorted(SUPPORTED_LANGUAGES)}",
        )

    if lang == "python":
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write(body.code)
            tmp = f.name
        try:
            out = _run([sys.executable, tmp])
        finally:
            os.unlink(tmp)
        return out

    if lang == "javascript":
        with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False) as f:
            f.write(body.code)
            tmp = f.name
        try:
            out = _run(["node", tmp])
        finally:
            os.unlink(tmp)
        return out

    # sql — sandbox not available; return helpful message
    return {
        "stdout": "",
        "stderr": "SQL execution is not available in the sandbox environment.",
        "exit_code": 1,
    }
