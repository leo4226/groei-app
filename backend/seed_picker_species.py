"""Pre-seed species + care thresholds for all plants in the picker dataset.

Run once in production after any expansion of the picker plant list:
  cd backend && python seed_picker_species.py

Idempotent: get_or_create_species uses ON CONFLICT (slug) DO UPDATE,
threshold_service skips plants that already have thresholds.

Keep PICKER_PLANTS in sync with frontend/src/data/plants-dataset.ts
when new plants are added.
"""

import asyncio
import sys
import os

# Add backend to path so imports work when run from backend/
sys.path.insert(0, os.path.dirname(__file__))

from database import init_pool, close_pool, get_db
from species_service import get_or_create_species
from threshold_service import generate_thresholds


# Mirror of frontend/src/data/plants-dataset.ts — (latin_name, dutch_name).
# Keep in sync when plants-dataset.ts is expanded.
PICKER_PLANTS = [
    # ── SCHADUW ──
    ("Epimedium perralchicum", "Elfenbloem"),
    ("Pachysandra terminalis", "Schaduwgroen"),
    ("Hosta sieboldiana", "Hartlelie"),
    ("Helleborus orientalis", "Kerstroos"),
    ("Athyrium filix-femina", "Wijfjesvaren"),
    ("Pulmonaria officinalis", "Longkruid"),

    # ── NIEUW: SCHADUW ──
    ("Convallaria majalis", "Lelietje-van-dalen"),
    ("Ajuga reptans", "Kruipend zenegroen"),
    ("Liriope muscari", "Liriope"),
    ("Buxus sempervirens", "Buxus"),
    ("Ilex aquifolium", "Hulst"),
    ("Hedera helix", "Klimop"),
    ("Dryopteris filix-mas", "Mannetjesvaren"),

    # ── HALFSCHADUW ──
    ("Astilbe arendsii", "Pluimspirea"),
    ("Hakonechloa macra", "Japans wuivend gras"),
    ("Hydrangea anomala subsp. petiolaris", "Klimhortensia"),
    ("Digitalis purpurea", "Vingerhoedskruid"),
    ("Geranium Rozanne", "Ooievaarsbek"),
    ("Alchemilla mollis", "Vrouwenmantel"),
    ("Aquilegia vulgaris", "Akelei"),
    ("Persicaria amplexicaulis", "Duizendknoop"),
    ("Anemone hupehensis", "Herfstanemoon"),
    ("Rosa klimvarieteit", "Klimroos"),
    ("Clematis montana", "Bergclematis"),
    ("Crocosmia Lucifer", "Montbretia"),
    ("Phlox paniculata", "Vlambloem"),
    ("Thalictrum delavayi", "Ruit"),

    # ── NIEUW: HALFSCHADUW ──
    ("Astrantia major", "Astrantia"),
    ("Heuchera sanguinea", "Heuchera"),
    ("Tiarella cordifolia", "Tiarella"),
    ("Camellia japonica", "Camelia"),
    ("Hydrangea macrophylla", "Hortensia"),
    ("Wisteria sinensis", "Blauweregen"),
    ("Fuchsia magellanica", "Fuchsia"),
    ("Rhododendron hybride", "Rododendron"),
    ("Paeonia lactiflora", "Pioenroos"),
    ("Anemone hybrida", "Japanse anemoon"),

    # ── VOLLE ZON ──
    ("Salvia nemorosa", "Bossalie"),
    ("Lavandula angustifolia", "Lavendel"),
    ("Echinacea purpurea", "Zonnehoed"),
    ("Rudbeckia fulgida", "Zonnebloem vaste"),
    ("Agapanthus africanus", "Afrikaanse lelie"),
    ("Verbena bonariensis", "IJzerhard"),
    ("Pennisetum alopecuroides", "Lampenpoetsersgras"),
    ("Allium hollandicum", "Sierui"),
    ("Hylotelephium spectabile", "Hemelsleutel"),
    ("Nepeta faassenii", "Kattenkruid"),
    ("Kniphofia uvaria", "Vuurpijl"),
    ("Buddleja davidii", "Vlinderstruik"),
    ("Rosa struikvarieteit", "Struikroos"),
    ("Nassella tenuissima", "Vedergras"),

    # ── NIEUW: VOLLE ZON ──
    ("Tulipa hybride", "Tulp"),
    ("Narcissus hybride", "Narcis"),
    ("Crocus vernus", "Krokus"),
    ("Hyacinthus orientalis", "Hyacint"),
    ("Iris germanica", "Iris"),
    ("Dahlia pinnata", "Dahlia"),
    ("Helianthus annuus", "Zonnebloem eenjarig"),
    ("Tagetes patula", "Afrikaantje"),
    ("Centaurea cyanus", "Korenbloem"),
    ("Petunia hybrida", "Petunia"),
    ("Viola wittrockiana", "Viooltje"),
    ("Alcea rosea", "Stokroos"),
    ("Oenothera biennis", "Teunisbloem"),
    ("Bellis perennis", "Madeliefje"),
    ("Myosotis arvensis", "Vergeet-mij-niet"),
    ("Erysimum cheiri", "Muurbloem"),
    ("Lupinus polyphyllus", "Lupine"),
    ("Papaver orientale", "Klaproos oosterse"),
    ("Calluna vulgaris", "Heide"),
    ("Laurus nobilis", "Laurier"),
    ("Salvia rosmarinus", "Rozemarijn"),
    ("Thymus vulgaris", "Tijm"),
    ("Mentha spicata", "Munt"),
    ("Sambucus nigra", "Vlier"),
    ("Fargesia murieliae", "Bamboe"),
    ("Cortaderia selloana", "Pampasgras"),

    # ── BINNENPLANTEN ──
    ("Monstera deliciosa", "Gatenplant"),
    ("Calathea orbifolia", "Calathea"),
    ("Epipremnum aureum", "Scindapsus"),
    ("Ficus lyrata", "Vioolbladplant"),
    ("Dracaena marginata", "Drakenplant"),
    ("Crassula ovata", "Geldplant"),
    ("Aloe vera", "Aloe vera"),
    ("Echeveria elegans", "Echeveria"),
    ("Dracaena trifasciata", "Vrouwentong"),
    ("Phalaenopsis hybride", "Orchidee"),
    ("Guzmania hybride", "Bromelia"),
    ("Spathiphyllum hybride", "Lepelplant"),
    ("Zamioculcas zamiifolia", "Zamioculcas"),
]


async def main():
    print(f"Seeding {len(PICKER_PLANTS)} picker plants into plant_species...")
    await init_pool()

    seeded = 0
    already_existed = 0
    threshold_ok = 0
    threshold_skip = 0

    async with get_db() as db:
        for latin, dutch in PICKER_PLANTS:
            species_id = await get_or_create_species(db, dutch)
            if species_id:
                seeded += 1
                print(f"  ✓ {dutch:30} ({latin}) → species_id={species_id}")
            else:
                already_existed += 1
                print(f"  · {dutch:30} ({latin}) → already exists")

            # Generate care thresholds (skips if already cached on species)
            try:
                thresh = await generate_thresholds(dutch, latin)
                if thresh:
                    threshold_ok += 1
                else:
                    threshold_skip += 1
            except Exception as e:
                print(f"    ⚠ thresholds error: {e}")
                threshold_skip += 1

            # Rate limit: 0.5s between LLM calls
            await asyncio.sleep(0.5)

    await close_pool()
    print(f"\nDone! {seeded} seeded, {already_existed} already existed")
    print(f"Thresholds: {threshold_ok} generated, {threshold_skip} skipped/errored")


if __name__ == "__main__":
    asyncio.run(main())
