from pydantic import BaseModel
from datetime import date, datetime
from typing import Any, Literal


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
    care_schedules: list[CareScheduleCreate] = []


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
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool | None = None   # None = don't change
    phase: str | None = None             # 'seed' | 'sprout' | 'seedling' | 'young' | 'established'
    sown_date: date | None = None
    quantity: int | None = None          # None = don't change
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None


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
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool = False
    phase: str = 'established'
    sown_date: date | None = None
    quantity: int = 1
    species_id: int | None = None
    phenology: Any | None = None
    care_schedules: list[CareScheduleOut] = []
    care_status: str = "good"
    temp_status: str = "comfortable"


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
    notes: str | None = None


class CareUndo(BaseModel):
    care_log_id: int
    previous_next_due: date | None = None
    previous_last_done: datetime | None = None
    previous_last_done_by: int | None = None


class CareLogOut(BaseModel):
    id: int
    plant_id: int
    care_type: str
    done_by: int
    done_by_name: str | None = None
    done_at: datetime
    notes: str | None = None
    skipped: bool = False


# --- Dashboard ---

class CareTask(BaseModel):
    plant_id: int
    plant_name: str
    plant_photo: str | None = None
    location: str | None = None
    map_type: str | None = None
    care_type: str
    days_overdue: int
    last_done_by: str | None = None
    last_done_at: str | None = None
    schedule_id: int
    is_ephemeral: bool = False


class DashboardResponse(BaseModel):
    overdue: list[CareTask] = []
    due_today: list[CareTask] = []
    upcoming: list[CareTask] = []


class StatusCounts(BaseModel):
    total: int
    on_schedule: int
    thirsty: int
    dry: int


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
    species_name: str | None = None


class DashboardV2Response(BaseModel):
    overdue: list[CareTask] = []
    due_today: list[CareTask] = []
    upcoming: list[CareTask] = []
    status_counts: StatusCounts
    recent_log: list[RecentLogEntry] = []
    plant_fact: PlantFactOut | None = None


# --- Maps ---

class MapCreate(BaseModel):
    name: str
    map_type: str = 'outdoor'  # 'outdoor' | 'indoor'
    lat: float | None = None
    lon: float | None = None
    bearing: float = 0


class MapUpdate(BaseModel):
    name: str | None = None
    canvas_data: str | None = None
    map_type: str | None = None
    lat: float | None = None
    lon: float | None = None
    bearing: float | None = None


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


class MapItemsOut(BaseModel):
    plants: list[MapPlantOut] = []
    objects: list[MapObjectOut] = []


# --- Species / Phenology ---

class MonthPhenology(BaseModel):
    month: int
    phase: str
    phase_label_nl: str
    sun_hours_needed: float
    description_nl: str
    actions_nl: list[str]


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


# --- Home / Plant Fact (PlantFactOut defined above, before DashboardV2Response) ---


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
    created_at: datetime | None = None


# --- Auth ---

class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    household_name: str = ""


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
    """Generate an invite code (from the creator's household)."""


class InviteOutput(BaseModel):
    code: str
    expires_at: str


class JoinInput(BaseModel):
    code: str
    email: str
    password: str
    name: str


class AccountOut(BaseModel):
    id: int
    household_id: int
    email: str
    name: str
    avatar: str | None = None
    is_admin: bool = False
    household_name: str = ''


class HouseholdUpdate(BaseModel):
    """Rename the household."""
    name: str


class HouseholdUpdate(BaseModel):
    """Rename the household."""
    name: str



    id: int
    household_id: int
    email: str
    name: str
    avatar: str | None = None
    is_admin: bool = False


class CalendarEventOut(BaseModel):
    id: str                  # composite e.g. "schedule:42:water"
    date: str                # ISO date YYYY-MM-DD
    type: str                # 'water' | 'fertilize' | etc.
    plant_id: int | None
    plant_name: str | None
    plant_icon_variant: str | None
    schedule_id: int | None
    overdue: bool
    # ── warning enrichment ──
    severity: str | None = None   # 'urgent' | 'warning' | 'info' | None
    color: str | None = None      # canonical badge color from CareWarning
    icon: str | None = None       # emoji from CareWarning


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
    latin_name: str
    sun_preference: str | None
    sun_fit: str                     # 'perfect' | 'acceptable'
    is_native: bool | None
    pollinator_value: int | None
    flowering_months: list[int] | None
    gap_months_covered: list[int]
    reason: str                      # template text initially
    caveat: str | None


class RecommendationsOut(BaseModel):
    recommendations: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int


class GardenSuggestionsOut(BaseModel):
    suggestions: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int
