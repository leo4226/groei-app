"""Curated list of plants commonly grown by Dutch consumers — for seeding the
plant_species catalog. Used by scripts/add_dutch_plants.py.

Organised by category for legibility. Edit freely; the runner is idempotent
(skips species whose slug already exists in plant_species). After modifying,
re-run: python scripts/add_dutch_plants.py

Categories aim for broad consumer coverage, not botanical completeness:
  - Houseplants Dutch people actually own
  - Garden perennials/annuals/shrubs/trees popular in Dutch gardens & nurseries
  - Bulbs (huge in NL)
  - Edibles + herbs you'd grow on a balcony or in a kleine moestuin
  - Climbers & ornamental grasses
"""

PLANTS_HOUSEPLANTS = [
    # Foliage classics
    "Ficus elastica", "Ficus lyrata", "Ficus benjamina", "Ficus microcarpa", "Ficus pumila",
    "Monstera adansonii",
    "Sansevieria trifasciata", "Sansevieria cylindrica", "Sansevieria zeylanica",
    "Dracaena marginata", "Dracaena fragrans", "Dracaena reflexa", "Dracaena sanderiana",
    "Schefflera arboricola",
    "Aglaonema commutatum", "Aglaonema nitidum",
    "Epipremnum aureum", "Scindapsus pictus",
    "Zamioculcas zamiifolia",
    "Philodendron scandens", "Philodendron xanadu", "Philodendron selloum", "Philodendron hederaceum",
    "Pilea peperomioides",
    "Yucca elephantipes", "Yucca aloifolia",
    "Beaucarnea recurvata",
    # Calathea / Maranta family
    "Calathea orbifolia", "Calathea ornata", "Calathea lancifolia", "Calathea medallion",
    "Calathea roseopicta", "Calathea zebrina", "Calathea makoyana",
    "Maranta leuconeura",
    # Palms
    "Howea forsteriana", "Dypsis lutescens", "Chamaedorea elegans",
    # Anthurium / Spathiphyllum
    "Anthurium andraeanum", "Anthurium clarinervium", "Anthurium crystallinum",
    "Spathiphyllum wallisii",
    # Begonias / Hoya
    "Begonia maculata", "Begonia rex", "Begonia semperflorens",
    "Hoya carnosa", "Hoya kerrii",
    # Tradescantia / Peperomia
    "Tradescantia zebrina", "Tradescantia fluminensis", "Tradescantia pallida",
    "Peperomia obtusifolia", "Peperomia argyreia", "Peperomia caperata",
    # Strelitzia
    "Strelitzia nicolai", "Strelitzia reginae",
    # Succulents
    "Aloe vera", "Aloe aristata",
    "Crassula ovata", "Crassula perforata",
    "Echeveria elegans", "Echeveria setosa",
    "Sedum morganianum", "Sedum burrito",
    "Kalanchoe blossfeldiana", "Kalanchoe thyrsiflora",
    "Haworthia fasciata",
    "Senecio rowleyanus",
    # Cacti
    "Mammillaria spinosissima", "Opuntia microdasys", "Echinocactus grusonii",
    "Schlumbergera bridgesii",
    # Ferns
    "Nephrolepis exaltata", "Asplenium nidus", "Adiantum raddianum", "Pteris cretica",
    "Davallia mariesii", "Platycerium bifurcatum",
    # Flowering houseplants
    "Saintpaulia ionantha", "Cyclamen persicum",
    # Spider / asparagus / others
    "Chlorophytum comosum", "Asparagus densiflorus",
    "Tillandsia xerographica",
]

PLANTS_GARDEN_PERENNIALS = [
    # Hosta / Heuchera / Tiarella / shade staples
    "Hosta plantaginea", "Hosta fortunei", "Hosta sieboldiana",
    "Heuchera micrantha", "Tiarella cordifolia", "Brunnera macrophylla",
    "Pulmonaria officinalis", "Lamium maculatum",
    # Geraniums (cranesbills)
    "Geranium pratense", "Geranium sanguineum", "Geranium macrorrhizum", "Geranium phaeum",
    # Daisies / coneflowers
    "Echinacea purpurea", "Rudbeckia fulgida", "Rudbeckia hirta",
    "Aster novi-belgii", "Aster amellus",
    "Achillea millefolium", "Coreopsis tinctoria",
    "Bellis perennis",
    # Iris / Astilbe / Hemerocallis
    "Astilbe arendsii", "Hemerocallis fulva", "Iris germanica", "Iris sibirica",
    # Salvia / Stachys / Nepeta
    "Salvia nemorosa", "Stachys byzantina", "Nepeta faassenii",
    # Phlox / Anemone / Aquilegia
    "Phlox paniculata", "Anemone hupehensis", "Anemone nemorosa", "Aquilegia vulgaris",
    # Campanula / Helleborus / Lupin
    "Campanula persicifolia", "Campanula lactiflora",
    "Helleborus orientalis", "Helleborus niger",
    "Lupinus polyphyllus",
    # Hydrangeas
    "Hydrangea paniculata", "Hydrangea arborescens", "Hydrangea quercifolia",
    # Sedum / Saxifraga / Sempervivum
    "Sedum spectabile", "Sedum acre", "Sedum spurium",
    "Saxifraga arendsii", "Sempervivum tectorum",
    # Tall structural perennials
    "Monarda didyma", "Penstemon digitalis",
    "Persicaria amplexicaulis", "Persicaria affinis",
    "Eupatorium cannabinum", "Filipendula ulmaria",
    "Macleaya cordata", "Cimicifuga simplex",
    "Lythrum salicaria",
    # Spring perennials
    "Primula vulgaris", "Primula veris",
    "Sanguisorba officinalis", "Astrantia major", "Geum coccineum",
    "Knautia arvensis", "Linaria purpurea",
    "Aruncus dioicus", "Rodgersia aesculifolia",
    "Liatris spicata",
    # Groundcovers
    "Vinca minor", "Vinca major",
    "Veronica spicata", "Veronicastrum virginicum",
    # Ornamental grasses (perennial)
    "Stipa tenuissima", "Stipa gigantea",
    "Pennisetum alopecuroides", "Pennisetum orientale",
    "Calamagrostis acutiflora",
    "Festuca glauca", "Festuca amethystina",
    "Carex morrowii", "Carex oshimensis",
    "Hakonechloa macra", "Panicum virgatum", "Schizachyrium scoparium",
    "Lagurus ovatus", "Briza media",
]

PLANTS_GARDEN_ANNUALS = [
    # Bedding plants
    "Petunia hybrida", "Petunia x atkinsiana",
    "Pelargonium hortorum", "Pelargonium peltatum", "Pelargonium zonale",
    "Verbena bonariensis", "Verbena hybrida",
    "Tagetes patula", "Tagetes erecta",
    "Viola tricolor", "Viola cornuta", "Viola wittrockiana",
    "Lobelia erinus", "Lobelia cardinalis",
    "Impatiens walleriana", "Impatiens balsamina",
    "Antirrhinum majus",
    "Calendula officinalis",
    "Cosmos bipinnatus", "Cosmos sulphureus",
    "Zinnia elegans",
    "Centaurea cyanus",
    "Dahlia variabilis",
    "Dianthus caryophyllus", "Dianthus barbatus",
    "Eschscholzia californica",
    "Gazania rigens",
    "Helichrysum petiolare",
    "Lobularia maritima",
    "Matthiola incana",
    "Nemesia strumosa",
    "Nicotiana alata",
    "Osteospermum ecklonis",
    "Salvia splendens",
    "Sanvitalia procumbens",
    "Senecio cineraria",
    "Tropaeolum majus",
    "Verbascum thapsus",
    "Bidens ferulifolia",
    "Mimulus luteus",
    "Helianthus annuus",
    "Papaver rhoeas",
    "Myosotis sylvatica",
    "Digitalis purpurea",
    "Paeonia lactiflora",
]

PLANTS_GARDEN_SHRUBS = [
    # Roses
    "Rosa rugosa", "Rosa canina", "Rosa multiflora", "Rosa floribunda", "Rosa hybrida",
    # Hydrangea covered in perennials
    # Lavender / heather
    "Lavandula stoechas", "Lavandula dentata",
    "Calluna vulgaris", "Erica carnea",
    # Flowering shrubs
    "Buddleja davidii",
    "Forsythia intermedia", "Forsythia suspensa",
    "Spiraea japonica", "Spiraea bumalda",
    "Weigela florida",
    "Deutzia gracilis",
    "Philadelphus coronarius",
    "Sambucus nigra",
    "Viburnum opulus", "Viburnum tinus", "Viburnum carlesii",
    "Cornus alba", "Cornus sanguinea", "Cornus mas",
    "Hibiscus syriacus",
    "Hypericum calycinum",
    "Choisya ternata",
    "Caryopteris clandonensis",
    "Ceanothus thyrsiflorus",
    "Daphne mezereum",
    # Acid lovers
    "Rhododendron ponticum", "Rhododendron catawbiense",
    "Pieris japonica", "Skimmia japonica",
    # Berry / hedging shrubs
    "Berberis thunbergii",
    "Cotoneaster horizontalis",
    "Pyracantha coccinea",
    "Mahonia aquifolium",
    "Symphoricarpos albus",
    "Ribes sanguineum",
    "Lantana camara",
    # Evergreen structure
    "Ilex aquifolium", "Laurus nobilis",
    "Buxus sempervirens",
]

PLANTS_TREES = [
    # Oaks / beech / hornbeam
    "Quercus petraea", "Quercus rubra", "Quercus palustris",
    "Fagus sylvatica",
    "Carpinus betulus",
    "Tilia cordata", "Tilia platyphyllos",
    # Maples (more)
    "Acer campestre", "Acer pseudoplatanus", "Acer negundo", "Acer saccharinum",
    # Birches / willows / poplars
    "Betula pendula", "Betula utilis", "Betula ermanii",
    "Salix caprea", "Salix alba", "Salix babylonica",
    "Populus tremula", "Populus alba",
    # Rowans / mountain ash
    "Sorbus aria", "Sorbus aucuparia",
    # Conifers
    "Pinus sylvestris", "Pinus mugo", "Pinus nigra",
    "Picea abies", "Picea omorika",
    "Cedrus atlantica", "Cedrus deodara",
    "Abies nordmanniana",
    "Larix decidua",
    "Taxus baccata",
    # Showy ornamental trees
    "Magnolia soulangeana", "Magnolia stellata", "Magnolia grandiflora",
    "Liriodendron tulipifera",
    "Liquidambar styraciflua",
    "Catalpa bignonioides",
    "Cercis siliquastrum",
    "Robinia pseudoacacia",
    "Castanea sativa",
    "Aesculus hippocastanum",
    # Fruit trees (ornamental + edible)
    "Prunus avium", "Prunus domestica", "Prunus serrulata",
    "Prunus cerasifera", "Prunus spinosa",
    "Malus domestica", "Malus floribunda", "Malus sylvestris",
]

PLANTS_BULBS = [
    # Tulips & narcissi
    "Tulipa fosteriana", "Tulipa greigii", "Tulipa praestans", "Tulipa tarda",
    "Narcissus poeticus", "Narcissus jonquilla", "Narcissus tazetta",
    # Crocus & related
    "Crocus vernus", "Crocus chrysanthus", "Crocus sativus",
    "Eranthis hyemalis",
    "Galanthus nivalis",
    # Hyacinth / muscari / scilla / chionodoxa
    "Muscari armeniacum", "Muscari botryoides",
    "Scilla siberica",
    "Chionodoxa luciliae",
    "Anemone blanda",
    "Iris reticulata",
    # Alliums
    "Allium sphaerocephalon", "Allium moly", "Allium cernuum",
    # Lilies & fritillaries
    "Lilium candidum", "Lilium longiflorum", "Lilium martagon", "Lilium orientale",
    "Fritillaria imperialis", "Fritillaria meleagris",
    "Camassia leichtlinii",
    "Erythronium dens-canis",
    # Summer bulbs
    "Gladiolus hortulanus",
    "Canna indica",
    "Dahlia pinnata",
]

PLANTS_EDIBLES = [
    # Vegetables
    "Solanum melongena",
    "Capsicum chinense",
    "Cucumis melo", "Cucurbita maxima",
    "Citrullus lanatus",
    "Phaseolus coccineus",
    "Pisum sativum",
    "Vicia faba",
    "Glycine max",
    "Brassica oleracea", "Brassica rapa", "Brassica napus",
    "Apium graveolens",
    "Spinacia oleracea",
    "Beta vulgaris",
    "Cichorium intybus", "Cichorium endivia",
    "Foeniculum vulgare",
    "Asparagus officinalis",
    "Zea mays",
    # Fruit
    "Fragaria x ananassa",
    "Rubus fruticosus", "Rubus occidentalis",
    "Vaccinium corymbosum", "Vaccinium myrtillus", "Vaccinium vitis-idaea",
    "Ribes nigrum", "Ribes rubrum", "Ribes uva-crispa",
    "Vitis vinifera",
    "Citrus limon", "Citrus sinensis", "Citrus reticulata",
    "Olea europaea",
    "Ficus carica",
    "Cydonia oblonga",
    "Mespilus germanica",
    "Hippophae rhamnoides",
    "Actinidia deliciosa",
    "Aronia melanocarpa",
]

PLANTS_HERBS = [
    "Ocimum basilicum",
    "Rosmarinus officinalis",
    "Thymus vulgaris", "Thymus serpyllum",
    "Salvia officinalis",
    "Mentha spicata", "Mentha piperita",
    "Origanum vulgare", "Origanum majorana",
    "Coriandrum sativum",
    "Petroselinum crispum",
    "Anethum graveolens",
    "Allium schoenoprasum", "Allium tuberosum",
    "Borago officinalis",
    "Levisticum officinale",
    "Pimpinella anisum",
    "Carum carvi",
    "Artemisia dracunculus", "Artemisia absinthium",
    "Melissa officinalis",
    "Satureja hortensis",
    "Hyssopus officinalis",
    "Tanacetum parthenium",
    "Stevia rebaudiana",
    "Helichrysum italicum",
]

PLANTS_CLIMBERS = [
    "Clematis vitalba", "Clematis montana", "Clematis armandii",
    "Clematis jackmanii", "Clematis tangutica",
    "Lonicera periclymenum", "Lonicera henryi", "Lonicera nitida",
    "Hedera helix", "Hedera colchica",
    "Wisteria sinensis", "Wisteria floribunda",
    "Parthenocissus quinquefolia", "Parthenocissus tricuspidata",
    "Akebia quinata",
    "Passiflora caerulea",
    "Jasminum nudiflorum", "Jasminum officinale", "Jasminum polyanthum",
    "Solanum jasminoides",
]


# ──────────────────────────────────────────────────────────────────────────────
# Marktplaats-popular / specialty additions (added 2026-05-26)
# ──────────────────────────────────────────────────────────────────────────────

PLANTS_TRENDY_HOUSEPLANTS = [
    # Alocasia (huge Marktplaats genre)
    "Alocasia amazonica", "Alocasia polly", "Alocasia zebrina",
    "Alocasia macrorrhizos", "Alocasia cucullata", "Alocasia odora",
    "Alocasia micholitziana", "Alocasia baginda",
    # Anthurium (collector-grade)
    "Anthurium forgetii", "Anthurium magnificum", "Anthurium veitchii",
    # Caladium / Stromanthe / Syngonium / Ctenanthe
    "Caladium bicolor", "Caladium lindenii",
    "Stromanthe sanguinea",
    "Syngonium podophyllum",
    "Ctenanthe burle-marxii", "Ctenanthe setosa",
    # More Hoya (active trading scene)
    "Hoya obovata", "Hoya krohniana", "Hoya linearis", "Hoya pubicalyx",
    # More Philodendron
    "Philodendron erubescens", "Philodendron micans",
    "Philodendron gloriosum", "Philodendron melanochrysum",
    # More Calathea / Goeppertia (taxonomically reclassified)
    "Goeppertia warscewiczii", "Goeppertia rufibarba", "Goeppertia crocata",
    # Trailing / string plants
    "Ceropegia woodii", "Senecio radicans",
    # Coleus / Polka dot / Croton / Aspidistra
    "Plectranthus scutellarioides",
    "Hypoestes phyllostachya",
    "Codiaeum variegatum",
    "Aspidistra elatior",
    # More Tradescantia / Spathiphyllum cousins
    "Tradescantia sillamontana", "Tradescantia spathacea",
    # Polyscias (Ming aralia etc.)
    "Polyscias fruticosa", "Polyscias scutellaria",
]

PLANTS_HOLIDAY_SEASONAL = [
    "Euphorbia pulcherrima",       # Poinsettia / Kerstster
    "Hippeastrum hybridum",         # Amaryllis
    "Cyclamen coum",                # Winter cyclamen
    "Schlumbergera truncata",       # Thanksgiving cactus
    "Viscum album",                 # Mistletoe / Maretak
    "Helleborus argutifolius",      # Corsican hellebore
    "Skimmia reevesiana",           # Berried Christmas plant
    "Cornus alba 'Sibirica'",       # red-stem dogwood for winter color
    "Hamamelis mollis",             # Witch hazel (winter bloom)
    "Sarcococca confusa",           # Christmas / sweet box
    "Convallaria majalis",          # Lily of the valley
    "Erica gracilis",               # Cape heather (autumn favorite)
]

PLANTS_AQUARIUM = [
    "Anubias barteri", "Anubias nana", "Anubias afzelii",
    "Cryptocoryne wendtii", "Cryptocoryne parva", "Cryptocoryne crispatula",
    "Echinodorus amazonicus", "Echinodorus bleheri",
    "Vallisneria spiralis", "Vallisneria americana",
    "Microsorum pteropus",          # Java fern
    "Vesicularia dubyana",          # Java moss
    "Ceratophyllum demersum",       # Hornwort
    "Hygrophila polysperma", "Hygrophila corymbosa",
    "Ludwigia repens", "Ludwigia palustris",
    "Rotala rotundifolia",
    "Eleocharis parvula",           # Dwarf hairgrass
    "Sagittaria subulata",
    "Limnophila sessiliflora",
    "Pogostemon helferi",
    "Bacopa monnieri",
]

PLANTS_CARNIVOROUS = [
    "Dionaea muscipula",            # Venus flytrap
    "Nepenthes ventricosa", "Nepenthes alata", "Nepenthes rajah",
    "Sarracenia purpurea", "Sarracenia flava",
    "Drosera capensis", "Drosera rotundifolia", "Drosera binata",
    "Pinguicula moranensis",
    "Cephalotus follicularis",
]

PLANTS_BONSAI = [
    "Carmona retusa",               # Fukien tea
    "Ulmus parvifolia",             # Chinese elm — bonsai classic
    "Juniperus chinensis",
    "Pinus pentaphylla",            # Japanese white pine
    "Acer palmatum",                # Japanese maple
    "Zelkova serrata",
    "Pyracantha angustifolia",
    "Murraya paniculata",           # Orange jasmine bonsai
    "Punica granatum",              # Pomegranate (bonsai + edible)
]

PLANTS_MEDITERRANEAN_TERRACE = [
    # Citrus expansions
    "Citrus aurantium", "Citrus paradisi", "Citrus japonica",
    "Citrus madurensis",            # Calamondin
    # Mediterranean staples
    "Bougainvillea spectabilis", "Bougainvillea glabra",
    "Plumbago auriculata",
    "Hibiscus rosa-sinensis",
    "Nerium oleander",
    "Cycas revoluta",               # Sago palm
    "Phoenix canariensis", "Phoenix roebelenii",
    "Trachycarpus fortunei",        # Windmill palm — hardy in NL
    "Cordyline australis",
    "Agave americana",
    # More clematis / climbers for pergolas
    "Clematis paniculata", "Clematis terniflora",
    # Heritage roses (often sold on Marktplaats)
    "Rosa damascena", "Rosa centifolia", "Rosa gallica",
    # Mediterranean fruit
    "Eriobotrya japonica",          # Loquat
    "Diospyros kaki",               # Persimmon
]

PLANTS_PONDS_AND_GAPS = [
    # Pond / water garden
    "Nymphaea alba", "Nymphaea odorata",
    "Iris pseudacorus", "Iris versicolor",
    "Pontederia cordata",
    "Sagittaria latifolia",
    "Typha latifolia",
    "Equisetum hyemale",            # Horsetail
    # Big ornamental grasses
    "Cortaderia selloana",          # Pampas grass
    "Imperata cylindrica",
    # Bamboo
    "Phyllostachys aurea",
    "Fargesia rufa",
    "Fargesia murielae",            # already common in NL gardens
    # Notable trees / oddities
    "Ginkgo biloba",                # Japanese maidenhair tree
    "Cornus kousa",                 # Korean dogwood
    "Davidia involucrata",          # Dove tree
    # Brassica oleracea cultivars too generic — covered by oleracea
    # Common European wildflowers gardeners cultivate
    "Cirsium rivulare",
    "Echinops ritro",               # Globe thistle
    "Eryngium planum",              # Sea holly
    "Verbascum chaixii",
    # Specialty edibles
    "Allium ampeloprasum",          # Leek
    "Helianthus tuberosus",         # Jerusalem artichoke
    "Stachys affinis",              # Chinese artichoke
    "Tropaeolum tuberosum",         # Mashua
]


def all_plants() -> list[tuple[str, str]]:
    """Returns (category, latin_name) tuples for all curated species."""
    out: list[tuple[str, str]] = []
    for cat, names in [
        ("houseplant", PLANTS_HOUSEPLANTS),
        ("perennial", PLANTS_GARDEN_PERENNIALS),
        ("annual", PLANTS_GARDEN_ANNUALS),
        ("shrub", PLANTS_GARDEN_SHRUBS),
        ("tree", PLANTS_TREES),
        ("bulb", PLANTS_BULBS),
        ("edible", PLANTS_EDIBLES),
        ("herb", PLANTS_HERBS),
        ("climber", PLANTS_CLIMBERS),
        ("trendy_houseplant", PLANTS_TRENDY_HOUSEPLANTS),
        ("holiday", PLANTS_HOLIDAY_SEASONAL),
        ("aquarium", PLANTS_AQUARIUM),
        ("carnivorous", PLANTS_CARNIVOROUS),
        ("bonsai", PLANTS_BONSAI),
        ("mediterranean", PLANTS_MEDITERRANEAN_TERRACE),
        ("pond_or_misc", PLANTS_PONDS_AND_GAPS),
    ]:
        for name in names:
            out.append((cat, name))
    return out
