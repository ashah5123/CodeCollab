import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.config import settings
from app.supabase_client import supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/submissions", tags=["submissions"])


class SubmissionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1)
    language: str = Field(default="python", max_length=50)
    description: str = Field(default="", max_length=2000)


class StatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=50)


class CodeUpdate(BaseModel):
    code: str = Field(min_length=1)


class DescriptionUpdate(BaseModel):
    description: str = Field(max_length=2000)


class ReviewDecision(BaseModel):
    feedback: str | None = Field(default=None, max_length=2000)


class SearchQuery(BaseModel):
    q: str = Field(min_length=1, max_length=200)


class GenerateMeta(BaseModel):
    code: str = Field(min_length=1)
    language: str = Field(default="python", max_length=50)


def _notify_mentions(comment_body: str, submission_id: str, from_email: str) -> None:
    """Parse @email mentions and silently create in-app notifications for each mentioned user."""
    try:
        # Match @user@domain.tld — the full email address after the leading @
        emails = set(re.findall(r"@([\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,})", comment_body))
        for email in emails:
            if email == from_email:
                continue
            # Look up user_id by email — try comments table first, then submissions
            result = (
                supabase_admin.table("comments")
                .select("user_id")
                .eq("user_email", email)
                .limit(1)
                .execute()
            )
            if not result.data:
                result = (
                    supabase_admin.table("submissions")
                    .select("user_id")
                    .eq("user_email", email)
                    .limit(1)
                    .execute()
                )
            if not result.data:
                continue
            target_user_id = result.data[0]["user_id"]
            supabase_admin.table("notifications").insert(
                {
                    "user_id": target_user_id,
                    "message": f"{from_email} mentioned you in a review comment",
                    "type": "mention",
                    "is_read": False,
                }
            ).execute()
    except Exception:
        pass  # Never block comment creation due to notification errors


def _get_submission_or_404(submission_id: str) -> dict:
    try:
        row = (
            supabase_admin.table("submissions")
            .select("*")
            .eq("id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return row.data[0]


def _require_owner(submission: dict, user: JWTPayload) -> None:
    if submission.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")


@router.get("")
def list_submissions(user: JWTPayload = Depends(get_current_user)):
    rows = (
        supabase_admin.table("submissions")
        .select("*")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return rows.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    user: JWTPayload = Depends(get_current_user),
):
    logger.info("create_submission: user=%s email=%s title=%r", user.sub, user.email, body.title)
    try:
        row = (
            supabase_admin.table("submissions")
            .insert(
                {
                    "user_id": user.sub,
                    "user_email": user.email or "",
                    "title": body.title,
                    "code": body.code,
                    "language": body.language,
                    "problem_description": body.description,
                    "status": "open",
                }
            )
            .execute()
        )
    except Exception as exc:
        logger.error("create_submission: DB insert failed for user=%s: %s", user.sub, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission",
        ) from exc
    if not row.data:
        logger.error("create_submission: insert returned no data for user=%s", user.sub)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission",
        )
    logger.info("create_submission: created submission id=%s for user=%s", row.data[0].get("id"), user.sub)
    return row.data[0]


@router.post("/search")
def search_submissions(
    body: SearchQuery,
    user: JWTPayload = Depends(get_current_user),
):
    """Search submissions by title, description and code using ilike (free, no FTS index required)."""
    q = body.q.strip()
    try:
        rows = (
            supabase_admin.table("submissions")
            .select("id, user_id, user_email, title, language, status, problem_description, created_at, code")
            .or_(f"title.ilike.%{q}%,problem_description.ilike.%{q}%,code.ilike.%{q}%")
            .order("created_at", desc=True)
            .limit(25)
            .execute()
        )
    except Exception as exc:
        logger.error("search_submissions: query=%r error=%s", q, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed.",
        ) from exc

    results = rows.data or []
    q_lower = q.lower()

    for sub in results:
        title = sub.get("title", "") or ""
        desc  = sub.get("problem_description", "") or ""
        code  = sub.get("code", "") or ""

        if q_lower in title.lower():
            sub["match_field"]   = "title"
            sub["match_snippet"] = title
        elif q_lower in desc.lower():
            idx   = desc.lower().find(q_lower)
            start = max(0, idx - 50)
            end   = min(len(desc), idx + len(q) + 50)
            sub["match_field"]   = "description"
            sub["match_snippet"] = ("…" if start > 0 else "") + desc[start:end] + ("…" if end < len(desc) else "")
        elif q_lower in code.lower():
            idx   = code.lower().find(q_lower)
            start = max(0, idx - 50)
            end   = min(len(code), idx + len(q) + 50)
            sub["match_field"]   = "code"
            sub["match_snippet"] = ("…" if start > 0 else "") + code[start:end] + ("…" if end < len(code) else "")
        else:
            sub["match_field"]   = None
            sub["match_snippet"] = None

    return results


@router.post("/generate-meta")
def generate_submission_meta(
    body: GenerateMeta,
    user: JWTPayload = Depends(get_current_user),
):
    """Use Groq to generate a title and description from pasted code."""
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI features are not configured (missing GROQ_API_KEY).",
        )

    try:
        from groq import Groq
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="groq SDK is not installed on this server.",
        ) from exc

    snippet = body.code[:3000]  # cap to keep prompt small
    prompt = (
        f"You are a code review assistant. Analyze this {body.language} code snippet and respond "
        f"with ONLY a JSON object — no markdown, no explanation, no code fences.\n\n"
        f"Required JSON format:\n"
        f'{{\"title\": \"<concise title, max 60 chars>\", '
        f'\"description\": \"<1-2 sentences explaining what the code does and what to review, max 200 chars>\"}}\n\n'
        f"Code:\n```{body.language}\n{snippet}\n```"
    )

    try:
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.2,
        )
    except Exception as exc:
        logger.error("generate_meta: Groq call failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Generation failed: {exc}",
        ) from exc

    import json, re as _re

    raw = (completion.choices[0].message.content or "").strip()

    # Strip code fences if the model wrapped the JSON
    raw = _re.sub(r"^```[a-zA-Z]*\n?", "", raw).strip()
    raw = _re.sub(r"\n?```$", "", raw).strip()

    # Isolate the first {...} block in case of surrounding text
    m = _re.search(r"\{.*\}", raw, _re.DOTALL)
    if m:
        raw = m.group(0)

    try:
        data = json.loads(raw)
    except Exception as exc:
        logger.error("generate_meta: JSON parse failed — raw=%r", raw)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an unexpected format. Please try again.",
        ) from exc

    return {
        "title":       str(data.get("title", "")).strip()[:255],
        "description": str(data.get("description", "")).strip()[:2000],
    }


@router.get("/{submission_id}")
def get_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("submissions")
            .select("id, user_id, user_email, title, code, language, status, problem_description, created_at")
            .eq("id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    submission = row.data[0]

    comments_row = (
        supabase_admin.table("comments")
        .select("*")
        .eq("submission_id", submission_id)
        .order("created_at", desc=False)
        .execute()
    )
    submission["comments"] = comments_row.data or []
    return submission


@router.get("/{submission_id}/comments")
def list_submission_comments(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    rows = (
        supabase_admin.table("comments")
        .select("*")
        .eq("submission_id", submission_id)
        .order("created_at", desc=False)
        .execute()
    )
    return rows.data or []


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    line_number: int | None = None


@router.post("/{submission_id}/comments", status_code=status.HTTP_201_CREATED)
def add_submission_comment(
    submission_id: str,
    body: CommentCreate,
    user: JWTPayload = Depends(get_current_user),
):
    _get_submission_or_404(submission_id)
    row = (
        supabase_admin.table("comments")
        .insert(
            {
                "submission_id": submission_id,
                "user_id": user.sub,
                "user_email": user.email or "",
                "body": body.body,
                "line_number": body.line_number if body.line_number is not None else 0,
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create comment",
        )
    comment = row.data[0]
    # Fire-and-forget: notify any @mentioned users
    _notify_mentions(body.body, submission_id, user.email or "")
    return comment


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.put("/{submission_id}/comments/{comment_id}")
def edit_submission_comment(
    submission_id: str,
    comment_id: str,
    body: CommentUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("comments")
            .select("*")
            .eq("id", comment_id)
            .eq("submission_id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    comment = row.data[0]
    if comment.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")
    updated = (
        supabase_admin.table("comments")
        .update({"body": body.body})
        .eq("id", comment_id)
        .execute()
    )
    return updated.data[0] if updated.data else comment


@router.delete("/{submission_id}/comments/{comment_id}")
def delete_submission_comment(
    submission_id: str,
    comment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("comments")
            .select("user_id")
            .eq("id", comment_id)
            .eq("submission_id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if row.data[0].get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")
    supabase_admin.table("comments").delete().eq("id", comment_id).execute()
    return {"message": "Comment deleted successfully"}


@router.get("/{submission_id}/comment_votes")
def get_submission_comment_votes(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Return upvote/downvote tallies for every comment in a submission, keyed by comment_id."""
    comments = (
        supabase_admin.table("comments")
        .select("id")
        .eq("submission_id", submission_id)
        .execute()
    )
    if not comments.data:
        return {}

    comment_ids = [c["id"] for c in comments.data]
    votes_rows = (
        supabase_admin.table("comment_votes")
        .select("*")
        .in_("comment_id", comment_ids)
        .execute()
    )
    all_votes = votes_rows.data or []

    result: dict = {}
    for cid in comment_ids:
        cv = [v for v in all_votes if v["comment_id"] == cid]
        upvotes   = sum(1 for v in cv if v["vote"] == 1)
        downvotes = sum(1 for v in cv if v["vote"] == -1)
        user_vote = next((v["vote"] for v in cv if v["user_id"] == user.sub), 0)
        result[cid] = {
            "upvotes": upvotes,
            "downvotes": downvotes,
            "net": upvotes - downvotes,
            "user_vote": user_vote,
        }
    return result


@router.patch("/{submission_id}/status")
def update_submission_status(
    submission_id: str,
    body: StatusUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"status": body.status})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.patch("/{submission_id}/code")
def update_submission_code(
    submission_id: str,
    body: CodeUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"code": body.code})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.patch("/{submission_id}/description")
def update_submission_description(
    submission_id: str,
    body: DescriptionUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"problem_description": body.description})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.post("/{submission_id}/approve")
def approve_submission(
    submission_id: str,
    body: ReviewDecision,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    update_data: dict = {"status": "approved"}
    if body.feedback:
        update_data["feedback"] = body.feedback
    row = (
        supabase_admin.table("submissions")
        .update(update_data)
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else {**submission, **update_data}


@router.post("/{submission_id}/reject")
def reject_submission(
    submission_id: str,
    body: ReviewDecision,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    update_data: dict = {"status": "rejected"}
    if body.feedback:
        update_data["feedback"] = body.feedback
    row = (
        supabase_admin.table("submissions")
        .update(update_data)
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else {**submission, **update_data}


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    supabase_admin.table("submissions").delete().eq("id", submission_id).execute()
    return None


# ─── AI Review ────────────────────────────────────────────────────────────────

@router.post("/{submission_id}/ai-review")
def ai_review_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Call Groq (llama-3.3-70b-versatile) to review the submission code and return suggestions."""
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI review is not configured on this server (missing GROQ_API_KEY).",
        )

    submission = _get_submission_or_404(submission_id)

    try:
        from groq import Groq  # imported here to keep startup fast when key is absent
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="groq SDK is not installed on this server.",
        ) from exc

    language = submission.get("language", "code")
    title    = submission.get("title", "Untitled")
    code     = submission.get("code", "")
    desc     = submission.get("problem_description") or ""

    prompt = f"""You are an expert {language} code reviewer. A developer has submitted the following code for peer review.

Title: {title}
Language: {language}{f'''
Problem description: {desc}''' if desc else ""}

```{language}
{code}
```

Please provide a structured code review with the following sections:

## Summary
One or two sentences describing what the code does.

## Issues
List any bugs, logic errors, or incorrect behaviour you find. If none, say "No issues found."

## Suggestions
Concrete, actionable improvements for readability, performance, idiomatic style, error handling, or best practices. Number each suggestion.

## Score
Rate the code quality from 1–10 with a one-sentence justification.

Be direct and specific. Refer to line content, not line numbers."""

    try:
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.3,
        )
    except Exception as exc:
        logger.error("ai_review: Groq API call failed for submission=%s: %s", submission_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI review failed: {exc}",
        ) from exc

    review_text = completion.choices[0].message.content or ""
    return {"review": review_text}


# ─── Summarize Discussion ─────────────────────────────────────────────────────

@router.post("/{submission_id}/summarize")
def summarize_discussion(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Call Groq to produce a concise summary of the comment discussion."""
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI features are not configured on this server (missing GROQ_API_KEY).",
        )

    submission = _get_submission_or_404(submission_id)

    comments_row = (
        supabase_admin.table("comments")
        .select("user_email, body, created_at")
        .eq("submission_id", submission_id)
        .order("created_at", desc=False)
        .execute()
    )
    comments = comments_row.data or []

    if not comments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No comments to summarize.",
        )

    try:
        from groq import Groq
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="groq SDK is not installed on this server.",
        ) from exc

    title    = submission.get("title", "Untitled")
    language = submission.get("language", "code")
    comments_text = "\n\n".join(
        f"[{c.get('user_email', 'unknown')}]: {c.get('body', '')}"
        for c in comments
    )

    prompt = f"""You are summarizing a peer code review discussion thread.

Submission title: {title}
Language: {language}
Number of comments: {len(comments)}

--- Discussion ---
{comments_text}
---

Please write a concise summary (3–5 sentences) covering:
- The main issues or concerns raised by reviewers
- Any consensus or agreement reached
- Key suggestions or action items
- The overall tone/sentiment of the discussion

Be direct and specific. Do not repeat comments verbatim."""

    try:
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            temperature=0.3,
        )
    except Exception as exc:
        logger.error(
            "summarize_discussion: Groq API call failed for submission=%s: %s",
            submission_id, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Summarization failed: {exc}",
        ) from exc

    summary_text = completion.choices[0].message.content or ""
    return {"summary": summary_text}
