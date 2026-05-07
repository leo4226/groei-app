# Plant Icons

109 original plant icons as individual SVG files.

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

## Plant list
01. **Monstera** (`monstera`) — *Monstera deliciosa* — houseplant · potted
02. **Golden Pothos** (`pothos`) — *Epipremnum aureum* — houseplant · potted
03. **Fiddle Leaf Fig** (`fiddle`) — *Ficus lyrata* — houseplant · potted
04. **Snake Plant** (`snake`) — *Dracaena trifasciata* — houseplant · potted
05. **ZZ Plant** (`zz`) — *Zamioculcas zamiifolia* — houseplant · potted
06. **Rubber Plant** (`rubber`) — *Ficus elastica* — houseplant · potted
07. **Peace Lily** (`peacelily`) — *Spathiphyllum wallisii* — houseplant · potted
08. **Spider Plant** (`spider`) — *Chlorophytum comosum* — houseplant · potted
09. **Heartleaf Philodendron** (`philo`) — *Philodendron hederaceum* — houseplant · potted
10. **Calathea** (`calathea`) — *Goeppertia orbifolia* — houseplant · potted
11. **Boston Fern** (`bostonfern`) — *Nephrolepis exaltata* — fern · potted
12. **Boston Fern** (`bostonfern_bare`) — *Nephrolepis exaltata* — fern · bare (variant of `bostonfern`)
13. **Bird's Nest Fern** (`birdnest`) — *Asplenium nidus* — fern · potted
14. **Areca Palm** (`areca`) — *Dypsis lutescens* — houseplant · potted
15. **Parlor Palm** (`parlor`) — *Chamaedorea elegans* — houseplant · potted
16. **Aloe Vera** (`aloe`) — *Aloe barbadensis* — succulent · potted
17. **Jade Plant** (`jade`) — *Crassula ovata* — succulent · potted
18. **Echeveria** (`echeveria`) — *Echeveria elegans* — succulent · potted
19. **Barrel Cactus** (`cactus`) — *Ferocactus glaucescens* — succulent · potted
20. **Prickly Pear** (`prickly`) — *Opuntia ficus-indica* — succulent · potted
21. **String of Pearls** (`stringpearls`) — *Curio rowleyanus* — succulent · potted
22. **Moth Orchid** (`orchid`) — *Phalaenopsis amabilis* — flower · potted
23. **African Violet** (`africanviolet`) — *Streptocarpus ionanthus* — flower · potted
24. **Anthurium** (`anthurium`) — *Anthurium andraeanum* — flower · potted
25. **Bromeliad** (`bromeliad`) — *Guzmania lingulata* — flower · potted
26. **Bonsai** (`bonsai`) — *Ficus retusa* — tree · potted
27. **Tulip** (`tulip`) — *Tulipa gesneriana* — bulb · potted
28. **Daffodil** (`daffodil`) — *Narcissus pseudonarcissus* — bulb · potted
29. **Hyacinth** (`hyacinth`) — *Hyacinthus orientalis* — bulb · potted
30. **Crocus** (`crocus`) — *Crocus vernus* — bulb · potted
31. **Snowdrop** (`snowdrop`) — *Galanthus nivalis* — bulb · potted
32. **Dutch Iris** (`iris`) — *Iris × hollandica* — flower · potted
33. **Allium** (`allium`) — *Allium giganteum* — bulb · potted
34. **Lavender** (`lavender`) — *Lavandula angustifolia* — herb · potted
35. **Lavender** (`lavender_bare`) — *Lavandula angustifolia* — herb · bare (variant of `lavender`)
36. **Rosemary** (`rosemary`) — *Salvia rosmarinus* — herb · potted
37. **Thyme** (`thyme`) — *Thymus vulgaris* — herb · potted
38. **Basil** (`basil`) — *Ocimum basilicum* — herb · potted
39. **Mint** (`mint`) — *Mentha spicata* — herb · potted
40. **Hydrangea** (`hydrangea`) — *Hydrangea macrophylla* — shrub · potted
41. **Garden Rose** (`rose`) — *Rosa × hybrida* — shrub · potted
42. **Sunflower** (`sunflower`) — *Helianthus annuus* — flower · potted
43. **Field Poppy** (`poppy`) — *Papaver rhoeas* — flower · potted
44. **Oxeye Daisy** (`daisy`) — *Leucanthemum vulgare* — flower · potted
45. **Foxglove** (`foxglove`) — *Digitalis purpurea* — flower · potted
46. **Peony** (`peony`) — *Paeonia lactiflora* — flower · potted
47. **Cornflower** (`cornflower`) — *Centaurea cyanus* — flower · potted
48. **Boxwood** (`boxwood`) — *Buxus sempervirens* — shrub · potted
49. **English Oak** (`oak`) — *Quercus robur* — tree · portrait
50. **Silver Birch** (`birch`) — *Betula pendula* — tree · portrait
51. **European Beech** (`beech`) — *Fagus sylvatica* — tree · portrait
52. **Weeping Willow** (`willow`) — *Salix babylonica* — tree · portrait
53. **Norway Maple** (`maple`) — *Acer platanoides* — tree · portrait
54. **Geranium** (`geranium`) — *Pelargonium × hortorum* — flower · potted
55. **Begonia** (`begonia`) — *Begonia semperflorens* — flower · potted
56. **Marigold** (`marigold`) — *Tagetes patula* — flower · potted
57. **Pansy** (`pansy`) — *Viola × wittrockiana* — flower · potted
58. **Fuchsia** (`fuchsia`) — *Fuchsia magellanica* — shrub · potted
59. **Heather** (`heather`) — *Calluna vulgaris* — shrub · potted
60. **Ivy** (`ivy`) — *Hedera helix* — shrub · potted
61. **Holly** (`holly`) — *Ilex aquifolium* — shrub · potted
62. **Dahlia** (`dahlia`) — *Dahlia pinnata* — flower · potted
63. **Petunia** (`petunia`) — *Petunia × atkinsiana* — flower · potted
64. **Forget-me-not** (`forgetmenot`) — *Myosotis sylvatica* — flower · potted
65. **Clematis** (`clematis`) — *Clematis vitalba* — shrub · potted
66. **Chinese Silver Grass** (`silvergrass`) — *Miscanthus sinensis* — grass · potted
67. **Fig Tree** (`figtree`) — *Ficus carica* — tree · portrait
68. **Bay Laurel** (`laurel`) — *Laurus nobilis* — shrub · potted
69. **Camellia** (`camellia`) — *Camellia japonica* — shrub · potted
70. **Bamboo** (`bamboo`) — *Phyllostachys edulis* — grass · potted
71. **Tomato** (`tomato`) — *Solanum lycopersicum* — edible · potted
72. **Tomato** (`tomato_bare`) — *Solanum lycopersicum* — edible · bare (variant of `tomato`)
73. **Brown Bean** (`brownbean`) — *Phaseolus vulgaris* — edible · potted
74. **Brown Bean** (`brownbean_bare`) — *Phaseolus vulgaris* — edible · bare (variant of `brownbean`)
75. **Avocado** (`avocado`) — *Persea americana* — edible · fruit
76. **Avocado Tree (2yr)** (`avocado_tree_potted`) — *Persea americana* — tree · potted (variant of `avocado`)
77. **Strawberry** (`strawberry`) — *Fragaria × ananassa* — edible · potted
78. **Strawberry** (`strawberry_bare`) — *Fragaria × ananassa* — edible · bare (variant of `strawberry`)
79. **Carrot** (`carrot`) — *Daucus carota* — edible · fruit
80. **Lettuce** (`lettuce`) — *Lactuca sativa* — edible · potted
81. **Lettuce** (`lettuce_bare`) — *Lactuca sativa* — edible · bare (variant of `lettuce`)
82. **Bell Pepper** (`pepper`) — *Capsicum annuum* — edible · potted
83. **Bell Pepper** (`pepper_bare`) — *Capsicum annuum* — edible · bare (variant of `pepper`)
84. **Pumpkin** (`pumpkin`) — *Cucurbita pepo* — edible · fruit
85. **Zucchini** (`zucchini`) — *Cucurbita pepo* — edible · fruit
86. **Cucumber** (`cucumber`) — *Cucumis sativus* — edible · fruit
87. **Radish** (`radish`) — *Raphanus sativus* — edible · fruit
88. **Potato** (`potato`) — *Solanum tuberosum* — edible · fruit
89. **Blueberry** (`blueberry`) — *Vaccinium corymbosum* — edible · fruit
90. **Garlic** (`garlic`) — *Allium sativum* — edible · fruit
91. **Onion** (`onion`) — *Allium cepa* — edible · fruit
92. **Corn** (`corn`) — *Zea mays* — edible · fruit
93. **Raspberry** (`raspberry_fruit`) — *Rubus idaeus* — edible · fruit (variant of `raspberry`)
94. **Raspberry** (`raspberry`) — *Rubus idaeus* — edible · potted
95. **Afrikaanse Lelie** (`agapanthus`) — *Agapanthus africanus* — flower · bare
96. **Blauweregen** (`wisteria`) — *Wisteria sinensis* — shrub · bare
97. **Wilde Akelei** (`aquilegia`) — *Aquilegia vulgaris* — flower · bare
98. **Columbine** (`columbine`) — *Aquilegia vulgaris* — flower · bare (variant of `aquilegia`)
99. **Male Fern** (`malefern`) — *Dryopteris filix-mas* — fern · bare
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
