# Floreren Plant Icon Generator

## Simplest Usage

```bash
cd groei/
python3 frontend/scripts/generate-plant-icon.py "Lavandula angustifolia" bare
python3 frontend/scripts/generate-plant-icon.py "Monstera deliciosa" potted
```

Just give it the Latin name + form (potted/bare). It auto-detects:
- **Common name** from the genus (e.g. "Lavandula" from "Lavandula angustifolia")
- **Category** from the genus (e.g. "Lavandula" → herb, "Quercus" → tree, "Rosa" → flower)
- Updates `icons/manifest.json` automatically

## All Options

```bash
# Override auto-detected name or category
python3 frontend/scripts/generate-plant-icon.py "Lavandula angustifolia" bare --name "Lavender" --cat herb

# Dry-run to preview
python3 frontend/scripts/generate-plant-icon.py "Fragaria vesca" potted --dry-run

# Use custom SVG plant snippet (e.g. from an LLM)
python3 frontend/scripts/generate-plant-icon.py "Strelitzia reginae" potted \
  --plant-svg '<g><!-- custom paths --></g>'

# All named options
python3 frontend/scripts/generate-plant-icon.py \
  --sci "Lavandula angustifolia" \
  --name "Lavender" \
  --cat herb \
  --form bare \
  --family "Lamiaceae" \
  --height 45
```

## How It Works

Every icon is a **100×100 SVG canvas**. The script generates:

1. **Pot** (potted/portrait): terracotta pot in y≈75-100 (#B2664A body, #C77B5D rim)
2. **Ground shadow** (bare/fruit): dark green ellipse at y=82 (opacity 0.4)
3. **Plant body**: auto-generated per category

### Categories

| Category | Visual | What Auto-Selects |
|---|---|---|
| houseplant | Oval leaves, central stem | Monstera, Ficus, Chlorophytum |
| flower | Broadleaf with blooms | Rosa, Tulipa, Helianthus |
| succulent | Rosette of ellipses | Aloe, Echeveria, Cactus |
| herb | Small bright leaves | Lavandula, Ocimum, Salvia |
| edible | Broadleaf green | Solanum, Fragaria |
| tree | Trunk + round canopy | Quercus, Olea, Palmae |
| grass | Curved blade strokes | Miscanthus, Bambusa |
| fern | Dense curved fronds | Nephrolepis, Adiantum |
| climber | Trailing stems | Hedera, Epipremnum |
| bulb | Few wide leaves | Allium, Tulipa |

## Files

- **Script**: `frontend/scripts/generate-plant-icon.py`
- **This doc**: `frontend/scripts/README-icon-generator.md`
- **Icons**: `icons/` (output directory)
- **Manifest**: `icons/manifest.json` (auto-updated)
