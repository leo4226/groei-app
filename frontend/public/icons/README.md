# Plant Icons

219 original plant icons as individual SVG files.

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
140. **Bruine Boon** (`brownbean_nopot`) — *Phaseolus vulgaris* — edible · nopot (variant of `brownbean`)
141. **Pampasgras** (`cortaderia_bare`) — *Cortaderia selloana* — grass · bare
142. **Zaad** (`seed`) — *pas geplant* — growth · stage
143. **Zaad (in de grond)** (`seed_bare`) — *pas geplant in tuin* — growth · stage_bare (variant of `seed`)
144. **Appel** (`apple`) — *Malus domestica* — edible · fruit
145. **Asperge** (`asparagus`) — *Asparagus officinalis* — edible · potted
146. **Biet** (`beet`) — *Beta vulgaris* — edible · potted
147. **Braam** (`blackberry`) — *Rubus fruticosus* — edible · fruit
148. **Zwarte bes** (`blackcurrant`) — *Ribes nigrum* — edible · fruit
149. **Broccoli** (`broccoli`) — *Brassica oleracea* — edible · potted
150. **Spruitjes** (`brusselssprouts`) — *Brassica oleracea var. gemmifera* — edible · potted
151. **Kool** (`cabbage`) — *Brassica oleracea* — edible · potted
152. **Bloemkool** (`cauliflower`) — *Brassica oleracea var. botrytis* — edible · potted
153. **Kers** (`cherry`) — *Prunus avium* — edible · fruit
154. **Witlof** (`chicory`) — *Cichorium intybus* — edible · potted
155. **Andijvie** (`endive`) — *Cichorium endivia* — edible · potted
156. **Druif** (`grape`) — *Vitis vinifera* — edible · fruit
157. **Snijbonen** (`greenbeans`) — *Phaseolus vulgaris* — edible · potted
158. **Boerenkool** (`kale`) — *Brassica oleracea var. sabellica* — edible · potted
159. **Prei** (`leek`) — *Allium porrum* — edible · potted
160. **Leon** (`leon`) — *Homo sapiens* — houseplant · potted
161. **Peer** (`pear`) — *Pyrus communis* — edible · fruit
162. **Erwten** (`peas`) — *Pisum sativum* — edible · potted
163. **Pruim** (`plum`) — *Prunus domestica* — edible · fruit
164. **Rode kool** (`redcabbage`) — *Brassica oleracea var. capitata f. rubra* — edible · potted
165. **Rode bes** (`redcurrant`) — *Ribes rubrum* — edible · fruit
166. **Rabarber** (`rhubarb`) — *Rheum rhabarbarum* — edible · potted
167. **Spinazie** (`spinach`) — *Spinacia oleracea* — edible · potted
168. **Appel** (`apple_bare`) — *Malus domestica* — edible · bare (variant of `apple`)
169. **Appel** (`apple_fruit`) — *Malus domestica* — edible · fruit (variant of `apple`)
170. **Asperge** (`asparagus_bare`) — *Asparagus officinalis* — edible · bare (variant of `asparagus`)
171. **Biet** (`beet_bare`) — *Beta vulgaris* — edible · bare (variant of `beet`)
172. **Braam** (`blackberry_bare`) — *Rubus fruticosus* — edible · bare (variant of `blackberry`)
173. **Braam** (`blackberry_fruit`) — *Rubus fruticosus* — edible · fruit (variant of `blackberry`)
174. **Zwarte bes** (`blackcurrant_bare`) — *Ribes nigrum* — edible · bare (variant of `blackcurrant`)
175. **Zwarte bes** (`blackcurrant_fruit`) — *Ribes nigrum* — edible · fruit (variant of `blackcurrant`)
176. **Blauwe Bes** (`blueberry_bare`) — *Vaccinium corymbosum* — edible · bare (variant of `blueberry`)
177. **Blauwe Bes** (`blueberry_fruit`) — *Vaccinium corymbosum* — edible · fruit (variant of `blueberry`)
178. **Broccoli** (`broccoli_bare`) — *Brassica oleracea* — edible · bare (variant of `broccoli`)
179. **Spruitjes** (`brusselssprouts_bare`) — *Brassica oleracea var. gemmifera* — edible · bare (variant of `brusselssprouts`)
180. **Kool** (`cabbage_bare`) — *Brassica oleracea* — edible · bare (variant of `cabbage`)
181. **Wortel** (`carrot_bare`) — *Daucus carota* — edible · bare (variant of `carrot`)
182. **Wortel** (`carrot_fruit`) — *Daucus carota* — edible · fruit (variant of `carrot`)
183. **Bloemkool** (`cauliflower_bare`) — *Brassica oleracea var. botrytis* — edible · bare (variant of `cauliflower`)
184. **Kers** (`cherry_bare`) — *Prunus avium* — edible · bare (variant of `cherry`)
185. **Kers** (`cherry_fruit`) — *Prunus avium* — edible · fruit (variant of `cherry`)
186. **Witlof** (`chicory_bare`) — *Cichorium intybus* — edible · bare (variant of `chicory`)
187. **Mais** (`corn_bare`) — *Zea mays* — edible · bare (variant of `corn`)
188. **Mais** (`corn_fruit`) — *Zea mays* — edible · fruit (variant of `corn`)
189. **Komkommer** (`cucumber_bare`) — *Cucumis sativus* — edible · bare (variant of `cucumber`)
190. **Komkommer** (`cucumber_fruit`) — *Cucumis sativus* — edible · fruit (variant of `cucumber`)
191. **Andijvie** (`endive_bare`) — *Cichorium endivia* — edible · bare (variant of `endive`)
192. **Knoflook** (`garlic_bare`) — *Allium sativum* — edible · bare (variant of `garlic`)
193. **Knoflook** (`garlic_fruit`) — *Allium sativum* — edible · fruit (variant of `garlic`)
194. **Druif** (`grape_bare`) — *Vitis vinifera* — edible · bare (variant of `grape`)
195. **Druif** (`grape_fruit`) — *Vitis vinifera* — edible · fruit (variant of `grape`)
196. **Snijbonen** (`greenbeans_bare`) — *Phaseolus vulgaris* — edible · bare (variant of `greenbeans`)
197. **Boerenkool** (`kale_bare`) — *Brassica oleracea var. sabellica* — edible · bare (variant of `kale`)
198. **Prei** (`leek_bare`) — *Allium porrum* — edible · bare (variant of `leek`)
199. **Ui** (`onion_bare`) — *Allium cepa* — edible · bare (variant of `onion`)
200. **Ui** (`onion_fruit`) — *Allium cepa* — edible · fruit (variant of `onion`)
201. **Peer** (`pear_bare`) — *Pyrus communis* — edible · bare (variant of `pear`)
202. **Peer** (`pear_fruit`) — *Pyrus communis* — edible · fruit (variant of `pear`)
203. **Erwten** (`peas_bare`) — *Pisum sativum* — edible · bare (variant of `peas`)
204. **Pruim** (`plum_bare`) — *Prunus domestica* — edible · bare (variant of `plum`)
205. **Pruim** (`plum_fruit`) — *Prunus domestica* — edible · fruit (variant of `plum`)
206. **Aardappel** (`potato_bare`) — *Solanum tuberosum* — edible · bare (variant of `potato`)
207. **Aardappel** (`potato_fruit`) — *Solanum tuberosum* — edible · fruit (variant of `potato`)
208. **Pompoen** (`pumpkin_bare`) — *Cucurbita pepo* — edible · bare (variant of `pumpkin`)
209. **Pompoen** (`pumpkin_fruit`) — *Cucurbita pepo* — edible · fruit (variant of `pumpkin`)
210. **Radijs** (`radish_bare`) — *Raphanus sativus* — edible · bare (variant of `radish`)
211. **Radijs** (`radish_fruit`) — *Raphanus sativus* — edible · fruit (variant of `radish`)
212. **Framboos** (`raspberry_bare`) — *Rubus idaeus* — edible · bare (variant of `raspberry`)
213. **Rode kool** (`redcabbage_bare`) — *Brassica oleracea var. capitata f. rubra* — edible · bare (variant of `redcabbage`)
214. **Rode bes** (`redcurrant_bare`) — *Ribes rubrum* — edible · bare (variant of `redcurrant`)
215. **Rode bes** (`redcurrant_fruit`) — *Ribes rubrum* — edible · fruit (variant of `redcurrant`)
216. **Rabarber** (`rhubarb_bare`) — *Rheum rhabarbarum* — edible · bare (variant of `rhubarb`)
217. **Spinazie** (`spinach_bare`) — *Spinacia oleracea* — edible · bare (variant of `spinach`)
218. **Courgette** (`zucchini_bare`) — *Cucurbita pepo* — edible · bare (variant of `zucchini`)
219. **Courgette** (`zucchini_fruit`) — *Cucurbita pepo* — edible · fruit (variant of `zucchini`)
