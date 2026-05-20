# Plant Icons

139 original plant icons as individual SVG files.

## Files
- `icons/<id>.svg` — one file per plant (100×100 viewBox, no fixed pixel size)
- `icons/manifest.json` — array of { id, name, sci, cat, form, family, file }

## Using them in your app

### Plain HTML
```html
<img src="icons/monstera.svg" alt="Monstera" width="64" height="64">
```

### React / JSX
```jsx
<img src="/icons/monstera.svg" alt="Monstera" width={64} height={64} />
```

### Loading the full catalog
```js
const data = await fetch('icons/manifest.json').then(r => r.json());
data.plants.forEach(p => console.log(p.name, p.sci, p.form, "→", p.file));
```

## Forms
- **potted** — drawn in a terracotta pot
- **bare** — no pot; ready to drop into custom beds/borders
- **fruit** — just the produce
- **portrait** — full landscape tree/shrub
- **stage** — potted growth stage (life cycle)
- **stage_bare** — in-ground growth stage (life cycle)
- **state** — care-status indicator (water / temperature)

## Plant list
001. **Monstera** (`monstera`) — *Monstera deliciosa* — houseplant · potted
002. **Scindapsus** (`pothos`) — *Epipremnum aureum* — houseplant · potted
003. **Vioolbladplant** (`fiddle`) — *Ficus lyrata* — houseplant · potted
004. **Vrouwentongen** (`snake`) — *Dracaena trifasciata* — houseplant · potted
005. **ZZ-plant** (`zz`) — *Zamioculcas zamiifolia* — houseplant · potted
006. **Rubberplant** (`rubber`) — *Ficus elastica* — houseplant · potted
007. **Lepelplant** (`peacelily`) — *Spathiphyllum wallisii* — houseplant · potted
008. **Graslelie** (`spider`) — *Chlorophytum comosum* — houseplant · potted
009. **Hartblad Philodendron** (`philo`) — *Philodendron hederaceum var. oxycardium* — houseplant · potted
010. **Calathea** (`calathea`) — *Goeppertia orbifolia* — houseplant · potted
011. **Krulvaren** (`bostonfern`) — *Nephrolepis exaltata* — fern · potted
012. **Krulvaren** (`bostonfern_bare`) — *Nephrolepis exaltata* — fern · bare (variant of `bostonfern`)
013. **Nestvaren** (`birdnest`) — *Asplenium nidus* — fern · potted
014. **Areca-palm** (`areca`) — *Dypsis lutescens* — houseplant · potted
015. **Bergpalm** (`parlor`) — *Chamaedorea elegans* — houseplant · potted
016. **Aloë Vera** (`aloe`) — *Aloe barbadensis* — succulent · potted
017. **Jadeplant** (`jade`) — *Crassula ovata* — succulent · potted
018. **Echeveria** (`echeveria`) — *Echeveria elegans* — succulent · potted
019. **Bolcactus** (`cactus`) — *Ferocactus glaucescens* — succulent · potted
020. **Schijfcactus** (`prickly`) — *Opuntia ficus-indica* — succulent · potted
021. **Erwtenplant** (`stringpearls`) — *Curio rowleyanus* — succulent · potted
022. **Vlinderorchidee** (`orchid`) — *Phalaenopsis amabilis* — flower · potted
023. **Kaaps Viooltje** (`africanviolet`) — *Streptocarpus ionanthus* — flower · potted
024. **Flamingoplant** (`anthurium`) — *Anthurium andraeanum* — flower · potted
025. **Bromelia** (`bromeliad`) — *Guzmania lingulata* — flower · potted
026. **Bonsai** (`bonsai`) — *Ficus retusa* — tree · potted
027. **Tulp** (`tulip`) — *Tulipa gesneriana* — bulb · potted
028. **Narcis** (`daffodil`) — *Narcissus pseudonarcissus* — bulb · potted
029. **Hyacint** (`hyacinth`) — *Hyacinthus orientalis* — bulb · potted
030. **Krokus** (`crocus`) — *Crocus vernus* — bulb · potted
031. **Sneeuwklokje** (`snowdrop`) — *Galanthus nivalis* — bulb · potted
032. **Hollandse Iris** (`iris`) — *Iris × hollandica* — flower · potted
033. **Sierui** (`allium`) — *Allium giganteum* — bulb · potted
034. **Lavendel** (`lavender`) — *Lavandula angustifolia* — herb · potted
035. **Lavendel** (`lavender_bare`) — *Lavandula angustifolia* — herb · bare (variant of `lavender`)
036. **Rozemarijn** (`rosemary`) — *Salvia rosmarinus* — herb · potted
037. **Tijm** (`thyme`) — *Thymus vulgaris* — herb · potted
038. **Basilicum** (`basil`) — *Ocimum basilicum* — herb · potted
039. **Munt** (`mint`) — *Mentha spicata* — herb · potted
040. **Hortensia** (`hydrangea`) — *Hydrangea macrophylla* — shrub · potted
041. **Tuinroos** (`rose`) — *Rosa × hybrida* — shrub · potted
042. **Zonnebloem** (`sunflower`) — *Helianthus annuus* — flower · potted
043. **Klaproos** (`poppy`) — *Papaver rhoeas* — flower · potted
044. **Margriet** (`daisy`) — *Leucanthemum vulgare* — flower · potted
045. **Vingerhoedskruid** (`foxglove`) — *Digitalis purpurea* — flower · potted
046. **Pioenroos** (`peony`) — *Paeonia lactiflora* — flower · potted
047. **Korenbloem** (`cornflower`) — *Centaurea cyanus* — flower · potted
048. **Buxus** (`boxwood`) — *Buxus sempervirens* — shrub · potted
049. **Zomereik** (`oak`) — *Quercus robur* — tree · portrait
050. **Ruwe Berk** (`birch`) — *Betula pendula* — tree · portrait
051. **Beuk** (`beech`) — *Fagus sylvatica* — tree · portrait
052. **Treurwilg** (`willow`) — *Salix babylonica* — tree · portrait
053. **Noorse Esdoorn** (`maple`) — *Acer platanoides* — tree · portrait
054. **Pelargonium** (`geranium`) — *Pelargonium × hortorum* — flower · potted
055. **Begonia** (`begonia`) — *Begonia semperflorens* — flower · potted
056. **Afrikaantje** (`marigold`) — *Tagetes patula* — flower · potted
057. **Viooltje** (`pansy`) — *Viola × wittrockiana* — flower · potted
058. **Fuchsia** (`fuchsia`) — *Fuchsia magellanica* — shrub · potted
059. **Struikheide** (`heather`) — *Calluna vulgaris* — shrub · potted
060. **Klimop** (`ivy`) — *Hedera helix* — shrub · potted
061. **Hulst** (`holly`) — *Ilex aquifolium* — shrub · potted
062. **Dahlia** (`dahlia`) — *Dahlia pinnata* — flower · potted
063. **Petunia** (`petunia`) — *Petunia × atkinsiana* — flower · potted
064. **Vergeet-mij-nietje** (`forgetmenot`) — *Myosotis sylvatica* — flower · potted
065. **Clematis** (`clematis`) — *Clematis × jackmanii* — shrub · potted
066. **Chinees Prachtriet** (`silvergrass`) — *Miscanthus sinensis* — grass · potted
067. **Vijgenboom** (`figtree`) — *Ficus carica* — tree · portrait
068. **Laurier** (`laurel`) — *Laurus nobilis* — shrub · potted
069. **Camelia** (`camellia`) — *Camellia japonica* — shrub · potted
070. **Bamboe** (`bamboo`) — *Phyllostachys edulis* — grass · potted
071. **Tomaat** (`tomato`) — *Solanum lycopersicum* — edible · potted
072. **Tomaat** (`tomato_bare`) — *Solanum lycopersicum* — edible · bare (variant of `tomato`)
073. **Bruine Boon** (`brownbean`) — *Phaseolus vulgaris* — edible · potted
074. **Bruine Boon** (`brownbean_bare`) — *Phaseolus vulgaris* — edible · bare (variant of `brownbean`)
075. **Avocado** (`avocado`) — *Persea americana* — edible · fruit
076. **Avocadoboom (2 jr)** (`avocado_tree_potted`) — *Persea americana* — tree · potted (variant of `avocado`)
077. **Aardbei** (`strawberry`) — *Fragaria × ananassa* — edible · potted
078. **Aardbei** (`strawberry_bare`) — *Fragaria × ananassa* — edible · bare (variant of `strawberry`)
079. **Wortel** (`carrot`) — *Daucus carota* — edible · fruit
080. **Sla** (`lettuce`) — *Lactuca sativa* — edible · potted
081. **Sla** (`lettuce_bare`) — *Lactuca sativa* — edible · bare (variant of `lettuce`)
082. **Paprika** (`pepper`) — *Capsicum annuum* — edible · potted
083. **Paprika** (`pepper_bare`) — *Capsicum annuum* — edible · bare (variant of `pepper`)
084. **Pompoen** (`pumpkin`) — *Cucurbita pepo* — edible · fruit
085. **Courgette** (`zucchini`) — *Cucurbita pepo* — edible · fruit
086. **Komkommer** (`cucumber`) — *Cucumis sativus* — edible · fruit
087. **Radijs** (`radish`) — *Raphanus sativus* — edible · fruit
088. **Aardappel** (`potato`) — *Solanum tuberosum* — edible · fruit
089. **Blauwe Bes** (`blueberry`) — *Vaccinium corymbosum* — edible · fruit
090. **Knoflook** (`garlic`) — *Allium sativum* — edible · fruit
091. **Ui** (`onion`) — *Allium cepa* — edible · fruit
092. **Mais** (`corn`) — *Zea mays* — edible · fruit
093. **Framboos** (`raspberry_fruit`) — *Rubus idaeus* — edible · fruit (variant of `raspberry`)
094. **Framboos** (`raspberry`) — *Rubus idaeus* — edible · potted
095. **Afrikaanse Lelie** (`agapanthus`) — *Agapanthus africanus* — flower · bare
096. **Blauweregen** (`wisteria`) — *Wisteria sinensis* — shrub · bare
097. **Wilde Akelei** (`aquilegia`) — *Aquilegia vulgaris* — flower · bare
098. **Akelei** (`columbine`) — *Aquilegia vulgaris* — flower · bare (variant of `aquilegia`)
099. **Mannetjesvaren** (`malefern`) — *Dryopteris filix-mas* — fern · bare
100. **Kruipend Zenegroen** (`ajuga`) — *Ajuga reptans* — flower · bare
101. **Leliegras** (`liriope`) — *Liriope muscari* — grass · bare
102. **Muurbloem** (`wallflower`) — *Erysimum 'Bowles's Mauve'* — flower · bare
103. **Teunisbloem** (`oenothera`) — *Oenothera biennis* — flower · bare
104. **Vlier** (`elder`) — *Sambucus nigra* — shrub · bare
105. **Vlinderstruik** (`buddleja`) — *Buddleja davidii* — shrub · bare
106. **Vrouwenmantel** (`alchemilla`) — *Alchemilla mollis* — flower · bare
107. **Lelietje-van-dalen** (`lilyofthevalley`) — *Convallaria majalis* — flower · bare
108. **Chinees Prachtriet** (`silvergrass_bare`) — *Miscanthus sinensis* — grass · bare (variant of `silvergrass`)
109. **Blauweregen** (`wisteria_potted`) — *Wisteria sinensis* — shrub · potted (variant of `wisteria`)
110. **Pampasgras** (`pampasgras`) — *Cortaderia selloana* — grass · bare
111. **Drakenplant** (`drakenplant`) — *Dracaena marginata* — houseplant · potted
112. **Dracaena Compacta** (`dracaena_compacta`) — *Dracaena fragrans 'Compacta'* — houseplant · potted
113. **Pannenkoekenplant** (`pannenkoekenplant`) — *Pilea peperomioides* — houseplant · potted
114. **Wilde Bloemen** (`wildebloemen`) — *Gemengde wilde bloemen* — flower · bare
115. **Onkruid** (`onkruid`) — *Algemene onkruiddetectie* — flower · bare
116. **Hartlelie** (`hosta`) — *Hosta sieboldiana* — flower · bare
117. **Stokroos** (`stokroos`) — *Alcea rosea* — flower · bare
118. **Zonnehoed** (`zonnehoed`) — *Echinacea purpurea* — flower · bare
119. **Lupine** (`lupine`) — *Lupinus polyphyllus* — flower · bare
120. **Zaad** (`growth_seed`) — *pas geplant* — growth · stage
121. **Kiem** (`growth_sprout`) — *eerste groene punt* — growth · stage
122. **Zaailing** (`growth_seedling`) — *twee zaadlobben, eerste blad* — growth · stage
123. **Jonge plant** (`growth_young`) — *gevestigd, klein bladerdek* — growth · stage
124. **Volwassen** (`growth_established`) — *volle bladmassa, nog niet in bloei* — growth · stage
125. **Tot wasdom** (`growth_mature`) — *bloeiend / vruchtdragend* — growth · stage
126. **Zaad (in de grond)** (`growth_seed_bare`) — *pas geplant in tuin* — growth · stage_bare (variant of `growth_seed`)
127. **Kiem (in de grond)** (`growth_sprout_bare`) — *eerste groene punt* — growth · stage_bare (variant of `growth_sprout`)
128. **Zaailing (in de grond)** (`growth_seedling_bare`) — *twee zaadlobben, eerste blad* — growth · stage_bare (variant of `growth_seedling`)
129. **Jonge plant (in de grond)** (`growth_young_bare`) — *gevestigd, klein bladerdek* — growth · stage_bare (variant of `growth_young`)
130. **Volwassen (in de grond)** (`growth_established_bare`) — *volle bladmassa, nog niet in bloei* — growth · stage_bare (variant of `growth_established`)
131. **Tot wasdom (in de grond)** (`growth_mature_bare`) — *bloeiend / vruchtdragend* — growth · stage_bare (variant of `growth_mature`)
132. **Italiaanse Populier** (`poplar`) — *Populus nigra 'Italica' · ± 70 jaar* — tree · portrait
133. **Goed verzorgd** (`state_hydrated`) — *binnen schema* — state · state
134. **Dorstig** (`state_thirsty`) — *binnen 1 dag voor watergift* — state · state
135. **Droog** (`state_dry`) — *watergift te laat* — state · state
136. **Koud** (`state_chilling`) — *binnen 3 °C boven min_temp* — state · state
137. **Bevriezing** (`state_freezing`) — *op of onder min_temp* — state · state
138. **Hittestress** (`state_heatstress`) — *op of boven max_temp* — state · state
139. **Comfortabel** (`state_comfortable`) — *geen zorg (geen icon getoond)* — state · state
