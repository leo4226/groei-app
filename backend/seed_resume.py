"""Resume seeding picker species — skips already seeded, retries on failure."""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import init_pool, close_pool, get_db
from species_service import get_or_create_species
from threshold_service import generate_thresholds

REMAINING = [
    ("Tiarella cordifolia", "Tiarella"),
    ("Camellia japonica", "Camelia"),
    ("Hydrangea macrophylla", "Hortensia"),
    ("Wisteria sinensis", "Blauweregen"),
    ("Fuchsia magellanica", "Fuchsia"),
    ("Rhododendron hybride", "Rododendron"),
    ("Paeonia lactiflora", "Pioenroos"),
    ("Anemone hybrida", "Japanse anemoon"),
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
    print(f"Resuming: {len(REMAINING)} plants to check...")
    await init_pool()
    seeded = 0
    skipped = 0
    failed = 0
    async with get_db() as db:
        for latin, dutch in REMAINING:
            # Check if already exists
            row = await db.execute_fetchall(
                "SELECT id FROM plant_species WHERE LOWER(common_name_nl) = LOWER(?)",
                (dutch,),
            )
            if row:
                print(f"  · {dutch:30} already exists (id={row[0]['id']})")
                skipped += 1
                continue

            # Retry LLM up to 3 times
            ok = False
            for attempt in range(3):
                try:
                    species_id = await get_or_create_species(db, dutch)
                    if species_id:
                        print(f"  ✓ {dutch:30} ({latin}) → id={species_id}")
                        seeded += 1
                        ok = True
                        break
                except Exception as e:
                    err_msg = str(e)[:80]
                    print(f"  ⚠ {dutch:30} attempt {attempt+1} failed: {err_msg}")
                    await asyncio.sleep(2)
            if not ok:
                print(f"  ✗ {dutch:30} SKIPPED after 3 retries")
                failed += 1

            # Thresholds (non-fatal)
            try:
                await generate_thresholds(dutch, latin)
            except Exception:
                pass

            await asyncio.sleep(0.5)

    await close_pool()
    print(f"\nDone: {seeded} seeded, {skipped} already existed, {failed} failed")

asyncio.run(main())
