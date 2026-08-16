"""Household Care-rhythm proposal and preview endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_account, require_editor
from database import db_dep
from models import (
    CareRhythmApplyIn,
    CareRhythmConfig,
    CareRhythmOperationOut,
    CareRhythmOnboardingIn,
    CareRhythmOnboardingOut,
    CareRhythmPreviewOut,
    CareRhythmSettingsOut,
)
from services.care_rhythm import (
    CareRhythmStalePreview,
    CareRhythmUndoConflict,
    apply_care_rhythm,
    get_care_rhythm_settings,
    preview_care_rhythm,
    preview_onboarding_care_rhythm,
    undo_care_rhythm,
)


router = APIRouter(tags=["care rhythm"])


@router.get("/household/care-rhythm", response_model=CareRhythmSettingsOut)
async def get_household_care_rhythm(
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    return await get_care_rhythm_settings(db, account["household_id"])


@router.post("/care-rhythm/preview", response_model=CareRhythmPreviewOut)
async def preview_household_care_rhythm(
    body: CareRhythmConfig,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    return await preview_care_rhythm(
        db,
        household_id=account["household_id"],
        config=body.model_dump(),
    )


@router.post("/care-rhythm/apply", response_model=CareRhythmOperationOut)
async def apply_household_care_rhythm(
    body: CareRhythmApplyIn,
    account=Depends(require_editor),
    db=Depends(db_dep),
):
    try:
        return await apply_care_rhythm(
            db,
            household_id=account["household_id"],
            config=body.config.model_dump(),
            preview_hash=body.preview_hash,
        )
    except CareRhythmStalePreview:
        raise HTTPException(
            status_code=409,
            detail={"code": "stale_care_rhythm_preview"},
        )


@router.post(
    "/care-rhythm/onboarding-preview",
    response_model=CareRhythmOnboardingOut,
)
async def preview_onboarding_rhythm(
    body: CareRhythmOnboardingIn,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    return await preview_onboarding_care_rhythm(
        db,
        household_id=account["household_id"],
        map_id=body.map_id,
        interval_days=body.interval_days,
    )


@router.post("/care-rhythm/{operation_id}/undo")
async def undo_household_care_rhythm(
    operation_id: int,
    account=Depends(require_editor),
    db=Depends(db_dep),
):
    try:
        undone = await undo_care_rhythm(
            db,
            household_id=account["household_id"],
            operation_id=operation_id,
        )
    except CareRhythmUndoConflict:
        raise HTTPException(
            status_code=409,
            detail={"code": "care_rhythm_undo_conflict"},
        )
    if not undone:
        raise HTTPException(
            status_code=404,
            detail={"code": "care_rhythm_operation_not_found"},
        )
    return {"ok": True}
