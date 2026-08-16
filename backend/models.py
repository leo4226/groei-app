import json
import re as _re

from pydantic import BaseModel, Field, field_validator, model_validator

# Pragmatic email shape check (avoids the email-validator dependency that
# pydantic's EmailStr requires). Server-side backstop — the frontend already
# uses <input type="email"> + minLength, so honest users never hit this.
_EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(value: str) -> str:
    cleaned = (value or "").strip()
    if not _EMAIL_RE.match(cleaned):
        raise ValueError("invalid email address")
    return cleaned
from datetime import date, datetime
from typing import Any, Literal

from care_types import CARE_TYPES, normalize_care_type


# --- Sun requirement ---

# The only values `plants.sun_requirement` may hold. Shared with the species
# ecology `sun_preference` vocabulary and the frontend's PLANT_SUN_PROFILES.
SUN_REQUIREMENTS = ("shade", "partial_sun", "full_sun")

# Retired spellings from the five-tile Light control (#886). Two of the five
# tiles had no mapping at all, so "dark" and "bright" reached the column
# verbatim and matched no profile — the sun-fit card then rendered nothing.
# Migration 0070 rewrites the stored rows; this keeps a stale client from
# writing new ones.
_LEGACY_SUN_REQUIREMENTS = {
    "dark": "shade",
    "bright": "partial_sun",
    "indirect": "partial_sun",
    "full-sun": "full_sun",
}


def normalize_sun_requirement(value: str | None) -> str | None:
    """Canonical sun requirement, or None for unset/unrecognised input.

    Coerces rather than 422s: an unknown value is a client that is behind, and
    rejecting the whole save would lose the rest of the user's edit.
    """
    if value is None:
        return None
    cleaned = str(value).strip()
    if cleaned in SUN_REQUIREMENTS:
        return cleaned
    return _LEGACY_SUN_REQUIREMENTS.get(cleaned)


# --- Users ---

class UserOut(BaseModel):
    id: int
    name: str
    avatar: str | None = None
    language: Literal['nl', 'en'] = 'nl'


class UserLanguageUpdate(BaseModel):
    language: Literal['nl', 'en']


class UserUpdate(BaseModel):
    name: str | None = None
    avatar: str | None = None


# --- Locations ---

class LocationOut(BaseModel):
    id: int
    name: str
    icon: str | None = None
    sort_order: int = 0


class LocationCreate(BaseModel):
    name: str
    icon: str | None = None

class LocationUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    sort_order: int | None = None



# --- Plants ---

class CareScheduleCreate(BaseModel):
    care_type: str
    interval_days: int
    season_adjust: str | None = None  # JSON string
    notes: str | None = None
    rhythm_opt_out: bool = False
    next_due: date | None = None

    @field_validator("care_type", mode="before")
    @classmethod
    def canonicalize_care_type(cls, value):
        return normalize_care_type(value)


class CareScheduleSyncInput(BaseModel):
    schedules: list[CareScheduleCreate]


class PlantCreate(BaseModel):
    name: str
    species: str | None = None
    location_id: int | None = None
    acquired_date: date | None = None
    pot_size_cm: int | None = None
    notes: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    sun_requirement: str | None = None  # 'full_sun' | 'partial_sun' | 'shade'
    plant_type: str | None = None  # 'tree' | 'shrub' | 'grass' | 'herb' | 'flower' | etc.
    icon_key: str | None = None   # icon filename without extension, e.g. 'oak', 'raspberry'
    phase: str = 'established'    # 'seed' | 'sprout' | 'seedling' | 'young' | 'established'
    sown_date: date | None = None
    quantity: int = 1            # how many specimens this record represents
    # Container / provenance detail (0063). The Add Plant form has always asked
    # for these; before 0063 they had nowhere to go and were silently dropped.
    form_type: str | None = None       # 'pot' | 'ground' | 'seedling' | 'tree'
    pot_material: str | None = None    # 'terracotta' | 'plastic' | 'ceramic' | 'basket'
    pot_diameter_cm: int | None = None
    pot_height_cm: int | None = None
    has_drainage: bool | None = None
    substrate: list[str] | None = None
    acquired_from: str | None = None   # free text, e.g. 'Garden centre'
    mulch: bool | None = None          # NULL = unknown (neutral); True = mulched
    care_schedules: list[CareScheduleCreate] = []

    @field_validator("sun_requirement")
    @classmethod
    def _canonical_sun_requirement(cls, value: str | None) -> str | None:
        return normalize_sun_requirement(value)


class PlantUpdate(BaseModel):
    name: str | None = None
    species: str | None = None
    location_id: int | None = None
    acquired_date: date | None = None
    pot_size_cm: int | None = None
    last_repotted: date | None = None
    notes: str | None = None
    display_radius_cm: int | None = None
    sun_requirement: str | None = None
    measured_sun_hours: float | None = None  # manual sun-fit override; explicit null clears it
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool | None = None   # None = don't change
    phase: str | None = None             # 'seed' | 'sprout' | 'seedling' | 'young' | 'established'
    sown_date: date | None = None
    quantity: int | None = None          # None = don't change
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    form_type: str | None = None
    pot_material: str | None = None
    pot_diameter_cm: int | None = None
    pot_height_cm: int | None = None
    has_drainage: bool | None = None
    substrate: list[str] | None = None
    acquired_from: str | None = None
    mulch: bool | None = None          # True/False = set; None = leave as-is

    @field_validator("sun_requirement")
    @classmethod
    def _canonical_sun_requirement(cls, value: str | None) -> str | None:
        return normalize_sun_requirement(value)


class CareScheduleOut(BaseModel):
    id: int
    plant_id: int
    care_type: str
    interval_days: int
    season_adjust: str | None = None
    next_due: str
    last_done: str | None = None
    last_done_by: int | None = None
    last_done_by_name: str | None = None
    notes: str | None = None
    is_active: bool = True
    is_ephemeral: bool = False
    rhythm_opt_out: bool = False
    interval_source: str = "manual"


class PlantOut(BaseModel):
    id: int
    name: str
    species: str | None = None
    species_common_name_nl: str | None = None
    species_common_name_en: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    location_icon: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    photo_path: str | None = None
    acquired_date: date | None = None
    pot_size_cm: int | None = None
    last_repotted: date | None = None
    container_id: int | None = None
    notes: str | None = None
    is_active: bool = True
    is_locked: bool = False
    created_at: datetime | None = None
    sun_requirement: str | None = None
    measured_sun_hours: float | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool = False
    phase: str = 'established'
    sown_date: date | None = None
    quantity: int = 1
    species_id: int | None = None
    phenology: Any | None = None
    form_type: str | None = None
    pot_material: str | None = None
    pot_diameter_cm: int | None = None
    pot_height_cm: int | None = None
    has_drainage: bool | None = None
    substrate: list[str] = []
    acquired_from: str | None = None
    mulch: bool | None = None
    care_schedules: list[CareScheduleOut] = []
    care_status: str = "good"
    temp_status: str = "comfortable"

    @field_validator("substrate", mode="before")
    @classmethod
    def _parse_substrate(cls, v):
        """`substrate` is stored as a JSON array in a TEXT column."""
        if v is None or v == "":
            return []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
            except (ValueError, TypeError):
                return []
            return parsed if isinstance(parsed, list) else []
        return v


# --- Alerts ---

class PlantAlert(BaseModel):
    type: str           # drought | waterlog | cold | heat | bring_inside | fertilise
    severity: str       # info | warning | urgent
    message_nl: str
    icon: str


class TopAlert(BaseModel):
    alert_type: str   # overdue_water | due_today | drought | waterlog | cold | heat | bring_inside | fertilise
    severity: str     # urgent | warning | info
    icon: str


# --- Care ---

class CareAction(BaseModel):
    plant_id: int
    care_type: str
    user_id: int
    schedule_id: int | None = None
    notes: str | None = None

    @field_validator("care_type", mode="before")
    @classmethod
    def canonicalize_care_type(cls, value):
        return normalize_care_type(value)


class CareUndo(BaseModel):
    care_log_id: int
    previous_next_due: date | None = None
    previous_last_done: datetime | None = None
    previous_last_done_by: int | None = None


class GardenCareCompleteIn(BaseModel):
    care_type: str
    completed_at: date | None = None
    user_id: int
    map_id: int
    schedule_ids: list[int] | None = None

    @field_validator('care_type')
    @classmethod
    def validate_grouped_care_type(cls, value: str) -> str:
        normalized = normalize_care_type(value)
        definition = CARE_TYPES.get(normalized)
        if not definition or definition.get('is_weather_triggered'):
            raise ValueError('unsupported_grouped_care_type')
        return normalized

    @field_validator('schedule_ids')
    @classmethod
    def validate_schedule_ids(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if not value or any(schedule_id < 1 for schedule_id in value):
            raise ValueError('schedule_ids_must_be_non_empty_positive_integers')
        if len(value) != len(set(value)):
            raise ValueError('duplicate_schedule_ids')
        return value


class GardenCareOperationOut(BaseModel):
    operation_id: int
    care_type: str
    completed_at: date
    affected_count: int


class MapWateringRoundMemberOut(BaseModel):
    schedule_id: int
    plant_id: int
    plant_name: str
    plant_icon_variant: str | None = None
    canonical_date: date
    rhythm_opt_out: bool = False


class MapWateringRoundHistoryOut(BaseModel):
    operation_id: int
    completed_at: date
    completed_by: int | None = None
    completed_by_name: str | None = None
    affected_count: int
    can_undo: bool = False


class MapWateringRoundOut(BaseModel):
    map_id: int
    map_name: str
    members: list[MapWateringRoundMemberOut]
    history: list[MapWateringRoundHistoryOut]


class MapWateringRoundCompleteIn(BaseModel):
    completed_at: date | None = None
    user_id: int
    schedule_ids: list[int]

    @field_validator('schedule_ids')
    @classmethod
    def validate_schedule_ids(cls, value: list[int]) -> list[int]:
        if not value or any(schedule_id < 1 for schedule_id in value):
            raise ValueError('schedule_ids_must_be_non_empty_positive_integers')
        if len(value) != len(set(value)):
            raise ValueError('duplicate_schedule_ids')
        return value


class MoistureCheckResolveIn(BaseModel):
    map_id: int
    check_schedule_ids: list[int]
    outcome: Literal['still_moist', 'watered']
    completed_at: date
    user_id: int

    @field_validator('check_schedule_ids')
    @classmethod
    def validate_check_schedule_ids(cls, value: list[int]) -> list[int]:
        if not value or len(value) > 200 or any(schedule_id < 1 for schedule_id in value):
            raise ValueError('invalid_check_schedule_ids')
        if len(value) != len(set(value)):
            raise ValueError('duplicate_check_schedule_ids')
        return value


class MoistureCheckResolveOut(BaseModel):
    outcome: Literal['still_moist', 'watered']
    affected_count: int


# --- Care Logs ---

class CareLogOut(BaseModel):
    id: int
    plant_id: int
    care_type: str
    done_by: int
    done_by_name: str | None = None
    done_at: datetime
    notes: str | None = None
    skipped: bool = False


class CareTask(BaseModel):
    plant_id: int
    plant_name: str
    plant_photo: str | None = None
    location: str | None = None
    map_name: str | None = None
    map_type: str | None = None
    care_type: str
    next_due: str | None = None
    days_overdue: int
    last_done_by: str | None = None
    last_done_at: str | None = None
    schedule_id: int
    is_ephemeral: bool = False




class RecentLogEntry(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    icon_key: str | None
    care_type: str
    done_at: str
    notes: str | None


class PlantFactOut(BaseModel):
    plant_id: int
    plant_name: str
    icon_key: str | None = None
    fact_nl: str
    fact_en: str = ""
    species_name_nl: str | None = None
    species_name_en: str | None = None


# --- Maps ---

class MapCreate(BaseModel):
    name: str
    map_type: str = 'outdoor'  # 'outdoor' | 'indoor'
    lat: float | None = None
    lon: float | None = None
    bearing: float = 0
    is_public: bool = False
    photos_public: bool = False


class MapUpdate(BaseModel):
    name: str | None = None
    canvas_data: str | None = None
    map_type: str | None = None
    lat: float | None = None
    lon: float | None = None
    bearing: float | None = None
    streek_slug: str | None = None  # explicit set → 'manual' source (see maps router)
    is_public: bool | None = None
    photos_public: bool | None = None


class MapOut(BaseModel):
    id: int
    name: str
    slug: str
    svg_file: str
    viewbox: str
    scale_info: str | None = None
    sort_order: int = 0
    canvas_data: str | None = None
    thumbnail_file: str | None = None
    map_type: str = 'outdoor'
    lat: float | None = None
    lon: float | None = None
    bearing: float = 0
    streek_slug: str | None = None
    streek_source: str = 'auto'
    is_public: bool = False
    photos_public: bool = False
    place_name: str | None = None
    country_code: str | None = None


class ZoneOut(BaseModel):
    id: int
    map_id: int
    name: str
    zone_type: str
    sun_exposure: str | None = None
    boundary: str
    color: str | None = None
    sort_order: int = 0


class MapDetailOut(MapOut):
    pass


class MostUrgent(BaseModel):
    care_type: str
    days_overdue: int
    last_done_by: str | None = None


class MapPlantOut(BaseModel):
    id: int
    name: str
    species: str | None = None
    species_common_name_nl: str | None = None
    species_common_name_en: str | None = None
    map_x: float
    map_y: float
    photo_path: str | None = None
    container_id: int | None = None
    ground_zone_id: str | None = None
    display_radius_cm: int | None = None
    care_status: str = "good"
    temp_status: str = "comfortable"
    most_urgent: MostUrgent | None = None
    sun_requirement: str | None = None
    measured_sun_hours: float | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    species_id: int | None = None
    phenology: Any | None = None
    is_locked: bool = False
    quantity: int = 1
    top_alert: TopAlert | None = None
    alerts: list[TopAlert] = []
    top_warning: dict | None = None
    warnings: list[dict] = []


class BulkArchiveInput(BaseModel):
    plant_ids: list[int]


class PlantPositionUpdate(BaseModel):
    map_id: int
    map_x: float
    map_y: float
    ground_zone_id: str | None = None


class PlantContainerUpdate(BaseModel):
    container_id: int | None = None


class PlantGroundZoneUpdate(BaseModel):
    ground_zone_id: str | None = None
    map_x: float | None = None
    map_y: float | None = None


# --- Ground Zones ---

class GroundZoneOut(BaseModel):
    id: str
    map_id: int
    name: str
    zone_type: str
    polygon: str
    soil_note: str | None = None


# --- Objects ---

class ObjectCreate(BaseModel):
    name: str
    object_type: str
    shape: str
    diameter_cm: int | None = None
    width_cm: int | None = None
    depth_cm: int | None = None
    material: str | None = None
    color: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    rotation: float = 0
    notes: str | None = None
    category: str = "container"
    label: str | None = None
    preset: str | None = None


class ObjectUpdate(BaseModel):
    name: str | None = None
    object_type: str | None = None
    shape: str | None = None
    diameter_cm: int | None = None
    width_cm: int | None = None
    depth_cm: int | None = None
    material: str | None = None
    color: str | None = None
    rotation: float | None = None
    notes: str | None = None
    category: str | None = None
    label: str | None = None
    preset: str | None = None


class ObjectPositionUpdate(BaseModel):
    map_x: float
    map_y: float
    rotation: float | None = None


class ObjectOut(BaseModel):
    id: int
    name: str
    object_type: str
    shape: str
    diameter_cm: int | None = None
    width_cm: int | None = None
    depth_cm: int | None = None
    material: str | None = None
    color: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    rotation: float = 0
    notes: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None
    category: str = "container"
    label: str | None = None
    preset: str | None = None


class MapObjectOut(ObjectOut):
    contained_plants: list[MapPlantOut] = []


class SecondaryMarkerOut(BaseModel):
    """An additional placement of a plant on a map (the plant's primary spot
    stays on plants.map_x/map_y; these are the extra dots)."""
    id: int
    plant_id: int
    map_x: float
    map_y: float
    ground_zone_id: str | None = None
    phase: str | None = None
    name: str
    icon_key: str | None = None


class PlacementCreate(BaseModel):
    map_id: int
    map_x: float
    map_y: float
    ground_zone_id: str | None = None
    phase: str | None = None


class PlacementUpdate(BaseModel):
    map_x: float | None = None
    map_y: float | None = None
    ground_zone_id: str | None = None
    phase: str | None = None


class MapItemsOut(BaseModel):
    plants: list[MapPlantOut] = []
    objects: list[MapObjectOut] = []
    secondary_markers: list[SecondaryMarkerOut] = []


# --- Public garden atlas (anonymized, opt-in) ---

class PublicZoneOut(BaseModel):
    id: int
    name: str
    zone_type: str
    sun_exposure: str | None = None
    boundary: str
    color: str | None = None
    sort_order: int = 0


class PublicGroundZoneOut(BaseModel):
    id: str
    name: str
    zone_type: str
    polygon: str


class PublicPlantOut(BaseModel):
    id: int
    name: str
    latin_name: str | None = None
    species_common_name_nl: str | None = None
    species_common_name_en: str | None = None
    map_x: float
    map_y: float
    display_radius_cm: int | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    # Only populated when the owner opted in to photo sharing.
    photo_path: str | None = None


class PublicGardenSummary(BaseModel):
    """One opt-in garden in the atlas list — PII-free by construction.

    approx_lat/lon are rounded to 2 decimals (~1.1 km, city level) so the
    browse UI can say "an Amsterdam garden" without exposing the street
    address. city falls back to the ecological region name when no
    reverse-geocoded place name is stored.
    """
    slug: str
    name: str
    city: str | None = None
    country_code: str | None = None
    approx_lat: float | None = None
    approx_lon: float | None = None
    biodiversity_score: int | None = None
    species_count: int = 0
    plant_count: int = 0
    flower_months: list[int] = []
    streek_slug: str | None = None
    streek_name: str | None = None
    thumbnail_file: str | None = None  # only when photos_public


class PublicGardenDetail(PublicGardenSummary):
    viewbox: str
    canvas_data: str | None = None
    zones: list[PublicZoneOut] = []
    ground_zones: list[PublicGroundZoneOut] = []
    plants: list[PublicPlantOut] = []


# --- Species / Phenology ---

class MonthPhenology(BaseModel):
    month: int
    phase: str
    phase_label_nl: str
    phase_label_en: str | None = None
    sun_hours_needed: float
    description_nl: str
    description_en: str | None = None
    actions_nl: list[str]
    actions_en: list[str] | None = None


class PhenologyData(BaseModel):
    months: list[MonthPhenology]
    sow_window: list[int]
    transplant_window: list[int]
    harvest_window: list[int]
    frost_sensitive: bool
    min_temp_c: float | None = None
    max_height_cm: int | None = None
    max_spread_cm: int | None = None
    interesting_facts_nl: str
    interesting_facts_en: str | None = None
    climate_zone: str


class SpeciesImageOut(BaseModel):
    id: int
    url: str
    thumbnail_url: str | None = None
    source: str
    license: str | None = None
    is_primary: bool = False


class PlantSpeciesOut(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    common_name_en: str | None = None
    latin_name: str | None = None
    family: str | None = None
    genus: str | None = None
    growth_form: str | None = None
    climate_zone: str = "temperate"
    phenology: PhenologyData | None = None
    images_count: int = 0
    images: list[SpeciesImageOut] = []


class PlantSpeciesSearchResult(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    common_name_en: str | None = None
    latin_name: str | None = None
    family: str | None = None
    genus: str | None = None
    images_count: int = 0
    primary_image: SpeciesImageOut | None = None


class SpeciesSearchResponse(BaseModel):
    results: list[PlantSpeciesSearchResult]
    total: int
    page: int = 1
    per_page: int = 20


# --- Home / Plant Fact ---


# ── Weeds ──

class WeedAppearanceOut(BaseModel):
    flower_color: str
    flower_shape: str
    leaf_shape: str
    growth_form: str
    max_height_cm: int
    distinguishing: str
    look_alikes: list[str] = []


class WeedHabitatOut(BaseModel):
    places: list[str] = []
    soil_types: list[str] = []
    active_months: list[int] = []
    bloom_months: list[int] = []
    sun_preference: str


class WeedRemovalOut(BaseModel):
    root_type: str
    reproduces_via: list[str] = []
    removal_method: str
    removal_difficulty: str
    urgency: str
    removal_tip: str
    prevention: str


class WeedSpeciesOut(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    latin_name: str
    family: str | None = None
    common_names: list[str] = []
    appearance: WeedAppearanceOut | None = None
    habitat: WeedHabitatOut | None = None
    removal: WeedRemovalOut | None = None
    edible: bool = False
    edible_note: str | None = None
    interesting: str | None = None
    native_to_nl: bool = True


class WeedSpeciesListItem(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    latin_name: str
    family: str | None = None
    flower_color: str | None = None
    places: list[str] = []


class WeedSightingCreate(BaseModel):
    weed_id: int
    map_id: int
    map_x: float
    map_y: float
    notes: str | None = None
    sighted_at: str | None = None  # date string
    photo_data: str | None = None  # base64 data URL


class WeedSightingOut(BaseModel):
    id: int
    weed_id: int
    weed_name: str | None = None
    weed_slug: str | None = None
    latin_name: str | None = None
    removal_difficulty: str | None = None
    map_id: int
    map_x: float
    map_y: float
    notes: str | None = None
    sighted_at: str
    photo_url: str | None = None
    created_at: datetime | None = None


# --- Auth ---

class RegisterInput(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str
    household_name: str = ""
    language: Literal['nl', 'en'] = 'nl'

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        return _validate_email(v)


class LoginInput(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    account_id: int
    household_id: int
    name: str


class ForgotPasswordInput(BaseModel):
    email: str


class ResetPasswordInput(BaseModel):
    token: str
    new_password: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


class InviteInput(BaseModel):
    """Generate an invite code (from the creator's household).

    Only the owner may create invites; the role defaults to `viewer` for least
    privilege and may never be `owner`.
    """
    role: Literal['editor', 'viewer'] = 'viewer'


class InviteOutput(BaseModel):
    code: str
    expires_at: str
    role: Literal['editor', 'viewer']


class JoinInput(BaseModel):
    code: str
    email: str
    password: str = Field(min_length=8)
    name: str
    language: Literal['nl', 'en'] = 'nl'

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        return _validate_email(v)


class AccountCapabilities(BaseModel):
    can_edit: bool
    can_manage_household: bool


class AccountOut(BaseModel):
    id: int
    household_id: int
    email: str
    name: str
    avatar: str | None = None
    is_admin: bool = False
    household_name: str = ''
    role: Literal['owner', 'editor', 'viewer']
    capabilities: AccountCapabilities


class HouseholdUpdate(BaseModel):
    """Rename the household."""
    name: str


class HouseholdMemberUpdate(BaseModel):
    """Update a household member's visible profile fields."""
    name: str
    avatar: str | None = None


class HouseholdMemberOut(BaseModel):
    id: int
    name: str
    email: str
    avatar: str | None = None
    created_at: datetime
    role: Literal['owner', 'editor', 'viewer']
    capabilities: AccountCapabilities


class RoleChangeInput(BaseModel):
    """Change a household member's role (owner-only, editor/viewer only)."""
    role: Literal['editor', 'viewer']


class OutdoorMapOut(BaseModel):
    id: int
    name: str


class CalendarGroupingRule(BaseModel):
    map_id: int
    care_types: list[str]


class CalendarGroupingMapOut(OutdoorMapOut):
    map_type: Literal['outdoor', 'indoor']
    recurring_care_types: list[str]
    recommended_care_types: list[str]


class CalendarGroupingPreferencesIn(BaseModel):
    rules: list[CalendarGroupingRule] | None = None
    # Compatibility with the pre-#626 Cartesian-product payload.
    care_types: list[str] | None = None
    map_ids: list[int] | None = None

    @model_validator(mode='after')
    def require_rules_or_legacy_shape(self):
        if self.rules is None and (self.care_types is None or self.map_ids is None):
            raise ValueError('calendar_grouping_rules_required')
        return self


class CalendarGroupingPreferencesOut(BaseModel):
    rules: list[CalendarGroupingRule]
    maps: list[CalendarGroupingMapOut]
    # Compatibility projection for clients deployed before #626.
    care_types: list[str]
    map_ids: list[int]
    outdoor_maps: list[OutdoorMapOut]


def _validate_iso_weekdays(values: list[int], *, allow_empty: bool = True) -> list[int]:
    normalized = sorted(set(values))
    if (not allow_empty and not normalized) or len(normalized) > 2:
        raise ValueError('care_rhythm_requires_one_or_two_weekdays')
    if any(day < 1 or day > 7 for day in normalized):
        raise ValueError('care_rhythm_weekday_must_be_iso_1_to_7')
    return normalized


class CareRhythmMapOverride(BaseModel):
    map_id: int
    weekdays: list[int]

    @field_validator('weekdays')
    @classmethod
    def validate_weekdays(cls, values: list[int]) -> list[int]:
        return _validate_iso_weekdays(values, allow_empty=False)


class CareRhythmConfig(BaseModel):
    indoor_weekdays: list[int]
    outdoor_weekdays: list[int]
    map_overrides: list[CareRhythmMapOverride] = []

    @field_validator('indoor_weekdays', 'outdoor_weekdays')
    @classmethod
    def validate_default_weekdays(cls, values: list[int]) -> list[int]:
        return _validate_iso_weekdays(values)

    @model_validator(mode='after')
    def validate_unique_maps(self):
        map_ids = [override.map_id for override in self.map_overrides]
        if len(map_ids) != len(set(map_ids)):
            raise ValueError('duplicate_care_rhythm_map_override')
        return self


class CareRhythmMapOut(OutdoorMapOut):
    map_type: Literal['outdoor', 'indoor']


class CareRhythmSettingsOut(BaseModel):
    saved: bool
    config: CareRhythmConfig
    maps: list[CareRhythmMapOut]


class CareRhythmPreviewItemOut(BaseModel):
    schedule_id: int
    plant_id: int
    plant_name: str
    species_common_name_nl: str | None = None
    species_common_name_en: str | None = None
    plant_icon_variant: str | None = None
    map_id: int
    map_name: str
    map_type: Literal['outdoor', 'indoor']
    old_date: str
    new_date: str
    movement_days: int
    status: Literal['moved', 'unchanged', 'exception']
    reason: str


class CareRhythmGroupOut(BaseModel):
    date: str
    map_id: int
    map_name: str
    count: int
    schedule_ids: list[int]


class CareRhythmPreviewSummaryOut(BaseModel):
    total: int
    moved: int
    unchanged: int
    exceptions: int
    group_count: int


class CareRhythmPreviewOut(BaseModel):
    config: CareRhythmConfig
    preview_hash: str
    items: list[CareRhythmPreviewItemOut]
    groups: list[CareRhythmGroupOut]
    summary: CareRhythmPreviewSummaryOut


class CareRhythmApplyIn(BaseModel):
    config: CareRhythmConfig
    preview_hash: str


class CareRhythmOperationOut(BaseModel):
    operation_id: int
    affected_count: int
    preview_hash: str
    summary: CareRhythmPreviewSummaryOut


class CareRhythmOnboardingIn(BaseModel):
    map_id: int
    interval_days: int

    @field_validator('interval_days')
    @classmethod
    def validate_interval_days(cls, value: int) -> int:
        if value < 1:
            raise ValueError('interval_days_must_be_positive')
        return value


class CareRhythmOnboardingOut(BaseModel):
    available: bool
    baseline_date: str
    proposed_date: str | None = None
    movement_days: int
    reason: str


class CalendarGroupMemberOut(BaseModel):
    schedule_id: int
    plant_id: int
    plant_name: str
    plant_icon_variant: str | None = None
    reason_nl: str | None = None
    reason_en: str | None = None
    canonical_date: str | None = None


class CalendarEventOut(BaseModel):
    id: str                  # composite e.g. "schedule:42:water"
    date: str                # ISO date YYYY-MM-DD
    type: str                # 'water' | 'fertilize' | etc.
    status: Literal['scheduled', 'completed'] = 'scheduled'
    plant_id: int | None
    plant_name: str | None
    plant_icon_variant: str | None
    species_common_name_nl: str | None = None
    species_common_name_en: str | None = None
    schedule_id: int | None
    map_id: int | None = None
    map_name: str | None = None
    overdue: bool
    # ── warning enrichment ──
    severity: str | None = None   # 'urgent' | 'warning' | 'info' | None
    color: str | None = None      # canonical badge color from CareWarning
    icon: str | None = None       # emoji from CareWarning
    reason_nl: str | None = None
    reason_en: str | None = None
    action_nl: str | None = None
    action_en: str | None = None
    weather_metric: str | None = None
    weather_value_c: float | None = None
    forecast_day_label_nl: str | None = None
    forecast_day_label_en: str | None = None
    grouped: bool = False
    group_count: int | None = None
    group_member_schedule_ids: list[int] | None = None
    group_member_event_ids: list[str] | None = None
    group_members: list[CalendarGroupMemberOut] | None = None
    weather_triggered: bool = False
    weather_warning_id: str | None = None
    acknowledged_at: datetime | None = None
    canonical_date: str | None = None
    routine_session: bool = False
    routine_reason: str | None = None


class WaterPressurePlantOut(BaseModel):
    plant_id: int
    plant_name: str
    schedule_id: int
    environment: Literal['outdoor_container', 'outdoor_ground', 'indoor']
    next_due: date
    recommended_check_date: date
    level: Literal['unknown', 'normal', 'elevated', 'high']
    score: float
    reason_nl: str
    reason_en: str
    factors: dict[str, float | str]


class WaterPressureMapOut(BaseModel):
    map_id: int
    map_name: str
    map_type: Literal['outdoor', 'indoor']
    level: Literal['unknown', 'normal', 'elevated', 'high']
    weather_status: Literal['fresh', 'stale', 'unavailable', 'missing_coordinates']
    temperature_source: Literal['own_map', 'outdoor_proxy', 'none']
    source_timestamp: datetime | None = None
    high_count: int
    elevated_count: int
    plants: list[WaterPressurePlantOut]


class WaterOutlookOut(BaseModel):
    generated_at: date
    maps: list[WaterPressureMapOut]


# ── Water Log ──

class WaterLogOut(BaseModel):
    id: int
    watered_at: str
    watered_by: int | None = None
    water_amount: float | None = None  # ml
    created_at: datetime | None = None


# ── Plant Recommendations ──

class PlantRecommendationOut(BaseModel):
    species_id: int
    dutch_name: str
    english_name: str | None
    latin_name: str
    sun_preference: str | None
    sun_fit: str
    is_native: bool | None
    pollinator_value: int | None
    flowering_months: list[int] | None
    gap_months_covered: list[int]
    reason: str                      # template text in Dutch
    reason_en: str | None            # template text in English
    caveat: str | None
    is_streek: bool = False          # belongs to the garden's streek (streekeigen)
    is_drachtplant: bool = False     # Naturalis bee-forage plant
    fills_forage_gap: bool = False   # a drachtplant blooming in a bee forage-gap month
    is_moth_plant: bool = False      # night-flowering / moth-forage (nachtvlinder)
    supports_moth_gap: bool = False  # moth plant in a garden that has none yet
    habit: str | None = None         # tree|large_shrub|shrub|climber|perennial|grass|groundcover|bulb|annual
    mature_height_cm: int | None = None
    size_fit: str = "unknown"        # 'fits' | 'large_for_space' | 'unknown' (vs garden area)
    alternatives: dict | None = None # smaller same-function swaps when oversized


class RecommendationsOut(BaseModel):
    recommendations: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int


class GardenSuggestionsOut(BaseModel):
    suggestions: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int
