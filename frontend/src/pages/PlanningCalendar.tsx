     1|import { useState, useEffect, useMemo } from 'react'
     2|import { useFloreren } from '../store/useFloreren'
     3|import { fetchAlertSummary } from '../api/client'
     4|import type { Plant, Phenology, MonthPhenology } from '../types'
     5|
     6|const MONTH_NAMES_NL = [
     7|  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
     8|  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
     9|]
    10|
    11|const ACTIVE_PHASES = new Set([
    12|  'growing', 'flowering', 'fruiting', 'harvest', 'establishing', 'evergreen',
    13|])
    14|
    15|interface PlantWithMonth extends Plant {
    16|  _monthData?: MonthPhenology
    17|  _phenology?: Phenology
    18|}
    19|
    20|export default function PlanningCalendar() {
    21|  const plants = useFloreren(s => s.plants)
    22|  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
    23|  const currentMonth = new Date().getMonth() + 1
    24|  const [alertPlantIds, setAlertPlantIds] = useState<Set<number>>(new Set())
    25|
    26|  useEffect(() => {
    27|    fetchAlertSummary()
    28|      .then(s => setAlertPlantIds(new Set(s.plant_ids_with_alerts)))
    29|      .catch(() => {})
    30|  }, [])
    31|
    32|  const grouped = useMemo(() => {
    33|    const needs_action: PlantWithMonth[] = []
    34|    const growing: PlantWithMonth[] = []
    35|    const dormant: PlantWithMonth[] = []
    36|    const no_data: Plant[] = []
    37|
    38|    for (const plant of plants) {
    39|      const phenology = plant.phenology
    40|      if (!phenology) { no_data.push(plant); continue }
    41|
    42|      const monthData = phenology.months?.find(m => m.month === selectedMonth)
    43|      if (!monthData) { no_data.push(plant); continue }
    44|
    45|      const hasSow = phenology.sow_window?.includes(selectedMonth)
    46|      const hasTransplant = phenology.transplant_window?.includes(selectedMonth)
    47|      const hasHarvest = phenology.harvest_window?.includes(selectedMonth)
    48|
    49|      if (hasSow || hasTransplant || hasHarvest) {
    50|        needs_action.push({ ...plant, _monthData: monthData, _phenology: phenology })
    51|      } else if (ACTIVE_PHASES.has(monthData.phase)) {
    52|        growing.push({ ...plant, _monthData: monthData })
    53|      } else {
    54|        dormant.push({ ...plant, _monthData: monthData })
    55|      }
    56|    }
    57|
    58|    return { needs_action, growing, dormant, no_data }
    59|  }, [plants, selectedMonth])
    60|
    61|  return (
    62|    <div className="p-4 max-w-2xl mx-auto">
    63|      <h1 className="text-xl font-bold text-text mb-4">Tuinkalender</h1>
    64|
    65|      {/* Month selector */}
    66|      <div className="flex gap-1 overflow-x-auto pb-2 mb-5 -mx-4 px-4">
    67|        {MONTH_NAMES_NL.map((name, i) => {
    68|          const month = i + 1
    69|          const isSelected = selectedMonth === month
    70|          const isNow = month === currentMonth
    71|          return (
    72|            <button
    73|              key={month}
    74|              onClick={() => setSelectedMonth(month)}
    75|              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors shrink-0 ${
    76|                isSelected
    77|                  ? 'bg-primary text-white font-semibold'
    78|                  : isNow
    79|                    ? 'bg-primary/15 text-primary font-medium'
    80|                    : 'bg-surface text-text-muted border border-border'
    81|              }`}
    82|            >
    83|              {name.slice(0, 3)}
    84|            </button>
    85|          )
    86|        })}
    87|      </div>
    88|
    89|      <h2 className="text-base font-semibold text-text mb-3">
    90|        {MONTH_NAMES_NL[selectedMonth - 1]}
    91|      </h2>
    92|
    93|      {/* Action items */}
    94|      {grouped.needs_action.length > 0 && (
    95|        <section className="mb-5">
    96|          <h3 className="text-xs font-semibold text-due uppercase tracking-wider mb-2">
    97|            Actie vereist ({grouped.needs_action.length})
    98|          </h3>
    99|          <div className="space-y-2">
   100|            {grouped.needs_action.map(plant => (
   101|              <ActionCard key={plant.id} plant={plant} month={selectedMonth} hasAlert={alertPlantIds.has(plant.id)} />
   102|            ))}
   103|          </div>
   104|        </section>
   105|      )}
   106|
   107|      {/* Actively growing */}
   108|      {grouped.growing.length > 0 && (
   109|        <section className="mb-5">
   110|          <h3 className="text-xs font-semibold text-good uppercase tracking-wider mb-2">
   111|            Groeit actief ({grouped.growing.length})
   112|          </h3>
   113|          <div className="space-y-1">
   114|            {grouped.growing.map(plant => (
   115|              <div key={plant.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
   116|                <span className="text-sm text-text">
   117|                  {plant.name}
   118|                  {alertPlantIds.has(plant.id) && (
   119|                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">⚠️</span>
   120|                  )}
   121|                </span>
   122|                <span className="text-xs text-text-muted">{plant._monthData?.phase_label_nl}</span>
   123|              </div>
   124|            ))}
   125|          </div>
   126|        </section>
   127|      )}
   128|
   129|      {/* Dormant */}
   130|      {grouped.dormant.length > 0 && (
   131|        <section className="mb-5">
   132|          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
   133|            Rustperiode ({grouped.dormant.length})
   134|          </h3>
   135|          <div className="flex flex-wrap gap-1.5">
   136|            {grouped.dormant.map(plant => (
   137|              <span key={plant.id} className={`text-xs border px-2.5 py-1 rounded-full ${alertPlantIds.has(plant.id) ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-surface border-border text-text-muted'}`}>
   138|                {plant.name}{alertPlantIds.has(plant.id) ? ' ⚠️' : ''}
   139|              </span>
   140|            ))}
   141|          </div>
   142|        </section>
   143|      )}
   144|
   145|      {grouped.needs_action.length === 0 && grouped.growing.length === 0 && grouped.dormant.length === 0 && (
   146|        <p className="text-sm text-text-muted text-center py-8">
   147|          {plants.length === 0 ? 'Nog geen planten toegevoegd.' : 'Geen fenologiedata beschikbaar voor je planten.'}
   148|        </p>
   149|      )}
   150|    </div>
   151|  )
   152|}
   153|
   154|function ActionCard({ plant, month, hasAlert }: { plant: PlantWithMonth; month: number; hasAlert: boolean }) {
   155|  const phenology = plant._phenology ?? plant.phenology
   156|  const monthData = plant._monthData
   157|  const hasSow = phenology?.sow_window?.includes(month)
   158|  const hasTransplant = phenology?.transplant_window?.includes(month)
   159|  const hasHarvest = phenology?.harvest_window?.includes(month)
   160|
   161|  return (
   162|    <div className="bg-surface border border-border rounded-xl p-3">
   163|      <p className="font-medium text-text text-sm">
   164|        {plant.name}
   165|        {hasAlert && (
   166|          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">⚠️</span>
   167|        )}
   168|      </p>
   169|      <div className="flex gap-1.5 mt-2 flex-wrap">
   170|        {hasSow && (
   171|          <span className="text-xs bg-good/15 text-good px-2.5 py-0.5 rounded-full font-medium">
   172|            Zaai nu
   173|          </span>
   174|        )}
   175|        {hasTransplant && (
   176|          <span className="text-xs bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-medium">
   177|            Plant buiten
   178|          </span>
   179|        )}
   180|        {hasHarvest && (
   181|          <span className="text-xs bg-due/15 text-due px-2.5 py-0.5 rounded-full font-medium">
   182|            Oogstperiode
   183|          </span>
   184|        )}
   185|      </div>
   186|      {monthData?.actions_nl && monthData.actions_nl.length > 0 && (
   187|        <ul className="mt-2 space-y-0.5">
   188|          {monthData.actions_nl.map((action, i) => (
   189|            <li key={i} className="text-xs text-text-muted">→ {action}</li>
   190|          ))}
   191|        </ul>
   192|      )}
   193|    </div>
   194|  )
   195|}
   196|