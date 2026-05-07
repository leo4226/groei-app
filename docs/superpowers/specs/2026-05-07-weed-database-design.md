# Weed Database Design

A local reference dataset of common Dutch garden weeds for identification and removal guidance.

## Summary

Add a static `LocalWeed` dataset (like `LocalPlant`) with ~30–50 of the most common Dutch weeds. Each entry covers visual identification traits, habitat/season, and practical removal guidance. Phase 1 is browse-only; Phase 2 adds optional weed logging on maps.

## Domain

A **Weed** is a wild plant species commonly found in Dutch gardens that most gardeners want to remove. It is distinct from a Plant (an owned, cared-for individual) and from a Species (which provides care knowledge for desired plants).

## Schema

### `LocalWeed`

Four composed groups:

**Core Identity:**
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Slug, e.g. `"paardenbloem"` |
| `dutchName` | `string` | Primary Dutch name |
| `latinName` | `string` | Scientific name |
| `family` | `string` | Botanical family (Dutch) |
| `commonNames` | `string[]` | Alternative Dutch names |

**Appearance** (sub-type `WeedAppearance`):
| Field | Type | Description |
|---|---|---|
| `flowerColor` | `FlowerColor` | `'geel' \| 'wit' \| 'paars' \| 'roze' \| 'groen' \| 'bruin'` |
| `flowerShape` | `string` | Brief visual description |
| `leafShape` | `string` | e.g. "Gelobd", "Lancetvormig" |
| `growthForm` | `GrowthForm` | `'staand' \| 'kruipend' \| 'rozettend' \| 'klimmend' \| 'polvormend'` |
| `maxHeightCm` | `number` | Mature height |
| `distinguishing` | `string` | The one trait that makes it unmistakable |
| `lookAlikes` | `string[]` | IDs of similar weeds |

**Habitat & Season** (sub-type `WeedHabitat`):
| Field | Type | Description |
|---|---|---|
| `places` | `Place[]` | `'gazon' \| 'tegels' \| 'moestuin' \| 'border' \| 'braakliggend' \| 'vochtig'` |
| `soilTypes` | `string[]` | `'klei' \| 'zand' \| 'humus' \| 'voedselrijk' \| 'arm'` |
| `activeMonths` | `number[]` | Months visible above ground |
| `bloomMonths` | `number[]` | Flowering months |
| `sunPreference` | `string` | `'zon' \| 'halfschaduw' \| 'schaduw' \| 'all'` |

**Removal** (sub-type `WeedRemoval`):
| Field | Type | Description |
|---|---|---|
| `rootType` | `RootType` | `'penwortel' \| 'wortelstokken' \| 'oppervlakkig' \| 'vezelig'` |
| `reproducesVia` | `string[]` | `'zaad' \| 'wortelstokken' \| 'uitlopers' \| 'wortelfragmenten'` |
| `removalMethod` | `string` | How to remove |
| `removalDifficulty` | `string` | `'makkelijk' \| 'gemiddeld' \| 'moeilijk'` |
| `urgency` | `string` | `'laag' \| 'gemiddeld' \| 'hoog'` |
| `removalTip` | `string` | Practical timing/technique tip |
| `prevention` | `string` | How to prevent return |

**Misc:**
| Field | Type | Description |
|---|---|---|
| `edible` | `boolean` | Can you eat it? |
| `edibleNote` | `string \| null` | Preparation note |
| `interesting` | `string \| null` | Fun fact |
| `nativeToNL` | `boolean` | Native or introduced |

## Out of scope

- **Phase 2**: Weed logging on maps (a `WeedSighting` entity). The interface is designed so fields won't need restructuring if logging is added later.
- **Images**: Field reserved but not populated in Phase 1. Images require sourcing/rights.
- **API/DB integration**: Phase 1 is a static TS file consumed by the frontend, following `plants-dataset.ts` convention.

## File location

`groei/frontend/src/data/weeds-dataset.ts`

## Coverage target

30–50 of the most common Dutch garden weeds, covering:
- Lawn weeds (paardenbloem, madeliefje, klaver, weegbree, etc.)
- Between-tile weeds (straatgras, muurleeuwenbek, etc.)
- Border/vegetable garden weeds (zevenblad, brandnetel, heermoes, klein hoefblad, etc.)
- Invasive spreaders (haagwinde, akkerdistel, ridderzuring, etc.)
