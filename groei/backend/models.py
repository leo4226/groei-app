from pydantic import BaseModel
from datetime import date, datetime
from typing import Any


# --- Users ---

class UserOut(BaseModel):
    id: int
    name: str
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


class PlantOut(BaseModel):
    id: int
    name: str
    species: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    location_icon: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    photo_path: str | None = None
    acquired_date: str | None = None
    pot_size_cm: int | None = None
    last_repotted: str | None = None
    container_id: int | None = None
    notes: str | None = None
    is_active: bool = True
    is_locked: bool = False
    created_at: str | None = None
    sun_requirement: str | None = None
    plant_type: str | None = None
    icon_key: str | None = None
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


# --- Care ---

class CareAction(BaseModel):
    plant_id: int
    care_type: str
    user_id: int
    notes: str | None = None


class CareLogOut(BaseModel):
    id: int
    plant_id: int
    care_type: str
    done_by: int
    done_by_name: str | None = None
    done_at: str
    notes: str | None = None
    skipped: bool = False


# --- Dashboard ---

class CareTask(BaseModel):
    plant_id: int
    plant_name: str
    plant_photo: str | None = None
    location: str | None = None
    care_type: str
    days_overdue: int
    last_done_by: str | None = None
    last_done_at: str | None = None
    schedule_id: int


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


class DashboardV2Response(BaseModel):
    overdue: list[CareTask] = []
    due_today: list[CareTask] = []
    upcoming: list[CareTask] = []
    status_counts: StatusCounts
    recent_log: list[RecentLogEntry] = []
    plant_fact: 'PlantFactOut | None' = None


# --- Maps ---

class MapCreate(BaseModel):
    name: str
    map_type: str = 'outdoor'  # 'garden' | 'indoor'
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
    map_type: str = 'outdoor'
    lat: float | None = None
    lon: float | None = None
    bearing: float = 0


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
    created_at: str | None = None
    updated_at: str | None = None
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


class PlantSpeciesOut(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    common_name_en: str | None = None
    latin_name: str | None = None
    climate_zone: str = "temperate"
    phenology: PhenologyData | None = None


# --- Home / Plant Fact ---

class PlantFactOut(BaseModel):
    plant_id: int
    plant_name: str
    icon_key: str | None = None
    fact_nl: str
    species_name: str | None = None
