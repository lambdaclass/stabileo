# Dimensionado y heurísticas para cerrar el detallado

Investigación y experimento del 22 de octubre de 2026, sobre `55fd1e973` de PR536.
La recomendación es generar alternativas de armado compatibles entre miembros, conservar
las alternativas del catálogo y elegir la reparación según el fallo. Restringir globalmente
los diámetros no produjo una mejora aceptable en el ejemplo evaluado.

La [comparación de algoritmos de siete programas](design-software-algorithms.md) amplía
estas referencias y concreta los siguientes incrementos: plantillas de jaula, diversidad
de alternativas, reparación conjunta por nudo y verificación incremental.

## Procedimientos de referencia

Las referencias siguientes aportan procedimientos; sus límites numéricos no sustituyen la
edición CIRSOC, los materiales ni la declaración lateral del proyecto.

- **Predimensionar, analizar y ajustar.** La guía NIST para pórticos especiales parte de la
  distribución estructural y secciones preliminares, obtiene esfuerzos y combina diseño por
  resistencia y capacidad. Recomienda evitar varias capas cuando sea posible; si la congestión
  lo exige, reconsiderar la sección. También describe barras superiores continuas con refuerzos
  locales, y advierte que los empalmes de columnas duplican barras en una zona. La ubicación
  de empalmes y las reglas de capacidad de esta guía corresponden a pórticos especiales, no a
  cualquier sistema lateral. [NIST GCR 16-917-40, §§5 y 7](https://nvlpubs.nist.gov/nistpubs/gcr/2016/NIST.GCR.16-917-40.pdf).
- **Iterar diámetro y cantidad con el espacio real.** spBeam describe calcular una cantidad
  inicial desde el área requerida, comprobar separaciones y ensayar otros diámetros. Incluye
  el espacio consumido por los dobleces de estribos y permite una separación mayor por tolerancias.
  Recomienda continuidad cuando las longitudes calculadas se superponen.
  [Manual de spBeam, §2.5](https://www.structurepoint.org/spbeam-online-manual/spBeam-v10-Manual-Book/2.5.Detailing-Provisions/2.5.Detailing-Provisions.htm).
- **El detalle puede cambiar la solución resistente elegida.** En el ejemplo 4.1, The Concrete
  Centre advierte que 3H25 puede generar problemas de separación al detallar jaula y empalmes,
  y plantea 2H32 como alternativa. El cambio no es una regla universal de preferir barras grandes:
  responde a esa disposición concreta. El ejemplo incluye revisiones de flecha, anclaje,
  cortes y mínimos además de flexión y corte.
  [Worked Examples to Eurocode 2, §4.1, pp. 95–103](https://www.concretecentre.com/TCC/media/TCCMediaLibrary/Events/Online%20course/CCIP_Worked_Examples_EC2.pdf).

## Traducción propuesta al algoritmo

Esta secuencia es una propuesta para este repositorio, derivada de las referencias y de la
[auditoría del código y las geometrías](design-verification-audit.md). No está implementada
por el experimento de paletas.

1. **Elegir secciones preliminares por familias.** Considerar luces, alturas disponibles,
   servicio, estabilidad, capacidad y espacio de nudos. Una relación luz/altura puede orientar
   una semilla bajo sus hipótesis; no debe convertirse en certificado. Los límites y supuestos
   de cada comprobación deben venir del adaptador normativo.
2. **Resolver demandas antes de elegir armaduras.** Conservar las combinaciones que gobiernan
   cada cara y región, incluida inversión de momentos. Para columnas, usar interacción axial
   y biaxial y efectos de esbeltez aplicables, no solamente área obtenida del axil.
3. **Convertir áreas requeridas en pocas jaulas alternativas.** El área aproximada
   `As ≈ Mu / (φ fy z)` sirve como semilla para vigas. Cada alternativa necesita cantidad,
   diámetro, filas, posiciones, altura útil real y estribo completo. Mantener alternativas
   con distinto compromiso entre anclaje, congestión y acero, aunque una use algo más de área.
4. **Coordinar continuidad y transiciones.** Elegir barras de referencia por línea de vigas,
   agregar refuerzos locales y decidir dónde pueden terminar o empalmarse. En columnas,
   compatibilizar posiciones entre pisos. La pareja de empalme debe incluir geometría ejecutable,
   recubrimiento, separación frente a terceros, longitud disponible y confinamiento.
5. **Verificar y reparar por causa.** Construir el detalle y evaluar resistencia, servicio y
   constructibilidad dentro de la cobertura implementada. Una verificación no implementada
   permanece pendiente. Reabrir las decisiones del nudo o tramo afectado cuando falle.
6. **Reanalizar al cambiar secciones.** Actualizar peso, rigidez, demandas y verificaciones
   dependientes. Una sección propuesta con los esfuerzos anteriores sigue siendo preliminar.

### Heurísticas condicionadas por el fallo

| Fallo observado | Alternativas que conviene ofrecer | Contrapartida que hay que verificar |
| --- | --- | --- |
| Falta de separación en una fila o empalme | Menos barras de mayor diámetro; otra posición o ancho | Anclaje, radios, recubrimiento y cuantía máxima |
| Anclaje insuficiente | Más barras de menor diámetro; otra terminación admisible; mayor apoyo | Separación, congestión y continuidad |
| Capas interiores contra cierre de estribo | Otra orientación o geometría de cierre; cambiar filas y asientos conjuntamente | Apoyo lateral, confinamiento y altura útil |
| Demasiados empalmes en un nudo | Continuidad de barras base; mover o escalonar empalmes a zonas admisibles | Longitud disponible, demanda y restricciones del sistema lateral |
| Barras sin pareja entre pisos | Patrón compatible entre jaulas; transición explícita de cantidades y posiciones | Capacidad de ambos tramos y geometría de la transición |
| Flecha, deriva o capacidad de sección insuficiente | Revisar canto, ancho o sistema según la causa | Reanálisis y nuevas demandas en los vecinos |

Estas son operaciones candidatas, no instrucciones para omitir verificaciones. «Más acero»,
«menos barras» y «mayor diámetro» no son direcciones de mejora universales.

## Experimento: reducir familias de diámetros en vigas

Se ejecutó el camino de producción completo en `rc-design-frame`: 408 miembros, misma
declaración lateral, secciones y cargas. Cada perfil corrió en un proceso nuevo con el mismo
WASM release. Sólo se interceptó el generador de vigas para filtrar su catálogo; se conservaron
verificadores, umbrales y generador de columnas. Se filtró también la regeneración por feedback.
Es una ablación de alternativas, no una implementación de continuidad por línea ni una
búsqueda exhaustiva. El resto del recorrido de búsqueda puede cambiar al cambiar la paleta.

| Perfil | Diámetros de vigas (mm) | Estados finales `ok/warn` | Aprobados anteriores perdidos | Vigas no disponibles | Conflictos bloqueantes | Tiempo local (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Base | 10, 12, 16, 20, 25, 32 | 72 | 0 | 35 | 2981 | 14,73 |
| Desde Ø16 | 16, 20, 25, 32 | 97 | 19 | 71 | 364 | 15,61 |
| Familia acotada | 16, 20, 25 | 102 | 18 | 75 | 327 | 15,53 |
| Desde Ø20 | 20, 25, 32 | 134 | 3 | 248 | 132 | 38,79 |

La tabla usa una ejecución por perfil; los tiempos incluyen la carga del ejemplo y no son un
benchmark estadístico. Una segunda ejecución de Ø16–25 reprodujo las mismas identidades,
estados y conflictos (14,05 s). «No disponibles» es el estado final, no sólo `SEARCH_EXHAUSTED`: con Ø20 hay
235 búsquedas agotadas y 13 resultados `UNSUPPORTED`. Los primeros tres perfiles conservan
13 propuestas biaxiales, que no cuentan como aprobaciones.

La familia Ø16–25 agrega 48 aprobaciones y pierde 18, todas estas últimas de columnas,
aunque su generador no cambió. Las vigas 231–234 pasan de fallidas a aprobadas, pero las
columnas 42, 48 y 70 hacen el recorrido inverso. Además, aparecen 24 condiciones de
recubrimiento. Los miembros con búsqueda agotada que incluyen anclaje entre sus causas pasan
de 13 a 56; las categorías pueden superponerse.

La variante Ø20 deja **todas las vigas sin diseño disponible**. Sus 134 estados aprobados
son de columnas; la reducción de interferencias ocurre en un modelo con menor cobertura
de armado. No demuestra cierre del diseño global ni mejora de su constructibilidad. Tampoco
se puede atribuir toda la reducción de conflictos de los otros perfiles a mejores jaulas:
parte puede deberse a la pérdida de cobertura.

**Ninguna variante se incorpora como política de producción.** El resultado útil es identificar
alternativas y contrapartidas que la búsqueda debe conservar, y una métrica engañosa que debe
evitar: maximizar aprobaciones o minimizar choques perdiendo diseños de miembros vecinos.

## Cambios prioritarios y aceptación

1. **Unificar fallos resistentes y físicos en la cola.** El feedback actual deja fuera 284 de
   los 288 miembros fallidos de la base porque selecciona fallos de reverificación resistente.
   Cada restricción debe identificar las piezas y decisiones que pueden repararla.
2. **Generar candidatos completos y diversos.** La prioridad actual por filas y área en
   `buildRegionOptions` no modela la transición con otra viga. Su catálogo reducido a 40
   opciones y el recorrido por regiones tampoco garantizan explorar todas las combinaciones.
   Conservar familias por cantidad/diámetro/filas y compatibilidad, sin imponer una paleta global.
   Compartir las reglas geométricas con el materializador y el verificador.
3. **Probar el conjunto afectado.** Empezar por un empalme o jaula, incluir vecinos del nudo
   y continuidad entre pisos, ampliar el conjunto si hace falta. Usar tablas de compatibilidad
   y la programación dinámica existente para cadenas. Un rechazo se memoiza con la geometría
   de sus vecinos; no basta el hash del armado aislado.
4. **Mantener una solución de referencia completa.** Explorar alternativas con presupuesto
   determinista y conservar el mejor estado aceptable. No exigir que cada movimiento interno
   mejore el acero ni publicar estados intermedios incompletos. Al aceptar un lote, conservar
   por identidad los miembros cubiertos y aprobados, no introducir nuevas verificaciones
   pendientes y volver a validar el conjunto. Dentro de esos límites, priorizar cierre y
   restricciones antes que peso de acero.

El primer incremento de generación debería resolver un empalme con diámetros distintos
(caso 178/179 de la auditoría), con posiciones y recorrido comprobados. El siguiente debe
coordinar continuidad superior y cierres de estribos con todas las capas. Cada incremento
necesita casos pequeños con variaciones de sección, diámetro, giro y restricciones de usuario,
y luego el modelo completo. Este único edificio no prueba robustez general.

## Reproducción y estado de implementación

El experimento de paletas es opt-in y no cambia el generador de producción. Desde `web/`:

```sh
STABILEO_BEAM_PALETTE=baseline STABILEO_HEURISTICS_OUTPUT=/tmp/beam-baseline.json npx vitest run --project unit --maxWorkers=2 src/lib/store/__tests__/design-heuristics-experiment.test.ts
```

Repetir en procesos separados con `min16`, `family` y `min20`, cambiando el archivo de salida.
El JSON guarda identidades, estados, resultados de búsqueda y cobertura por tipo. Las aserciones
comprueban ejecución completa y ausencia de aprobados con conflictos físicos detectados;
que el experimento pase **no significa que la heurística sea aceptable**. Comparar cobertura,
identidades, condiciones abiertas y costo antes de proponer su adopción.

## Siguiente incremento: explorar alternativas locales con una guía

El rechazo de una paleta global no descarta sus armados como alternativas locales. Se implementa
`physical-design-search.ts`, integrado como segunda etapa opcional del ciclo y accesible desde
`detailingStore.generate({ physicalSearch: { maxDetailingRuns: 8, maxMemberSearches: 64 } })`.
La ejecución automática conserva su configuración anterior; esta búsqueda todavía se activa
explícitamente. No hay un nuevo control de interfaz en este incremento.

La primera operación disponible intenta simplificar una viga a una familia de diámetros:

1. Prioriza miembros por cantidad de conflictos físicos bloqueantes, con desempate estable.
2. Ensaya familias dentro del catálogo permitido. La prioridad inicial es Ø16, Ø12, Ø20 y
   Ø25, seguida de los restantes tamaños permitidos: es una heurística de orden, no una
   restricción nueva del proyecto ni una regla normativa.
3. Diseña y verifica cada alternativa antes de pagar un detallado completo. Un fallo nominal
   descarta esa alternativa y conserva el armado anterior; jamás elimina el miembro del modelo.
4. Reconstruye y verifica el detalle completo con las referencias actualizadas de las barras
   vecinas. Rechaza pérdida de cobertura, nuevos miembros bloqueados, regresiones resistentes
   y aumentos de las categorías de condiciones abiertas que controla el ciclo existente.
5. Conserva el cambio sólo si supera esas protecciones y reduce miembros bloqueados o
   conflictos bloqueantes. Un rechazo permite probar otra familia y continuar con otro miembro.
   El candidato aceptado y su detalle se conservan juntos.

La búsqueda recorre una vez la lista priorizada y conserva el mejor estado aceptado. No
memoiza rechazos entre geometrías. Respeta miembros bloqueados por el usuario y no reemplaza
propuestas biaxiales ni piezas de vigas divididas en varios elementos; estas últimas necesitan
una operación conjunta. El presupuesto limita tanto búsquedas nominales como reconstrucciones
completas, incluidas las rechazadas. Agotar esas operaciones no demuestra inviabilidad.

### Resultado del camino completo

| Medición | Base | Con exploración local |
| --- | ---: | ---: |
| Aprobados finales | 72 | 76 |
| Aprobados anteriores perdidos | — | 0 |
| Fallidos | 288 | 284 |
| Vigas no disponibles | 35 | 35 |
| Propuestas biaxiales | 13 | 13 |
| Conflictos bloqueantes | 2981 | 2066 |

Se conservan los 72 aprobados por identidad y se agregan las columnas **40, 45, 50 y 65**,
al despejar interferencias con vigas. Se reemplazan los armados de las vigas 207, 223, 257,
204, 254 y 230. La mejora de los vecinos no significa que esas seis vigas ya cierren todos
sus propios requisitos. Los bloqueos de empalmes pendientes conservan sus conteos anteriores.

Se hicieron 18 búsquedas nominales, con 489 candidatos/verificaciones; sólo 8 llegaron a la
reconstrucción completa. Se aceptaron 6 cambios y se rechazaron 2. El cierre del barrido fue
por presupuesto, conservando el mejor estado. No hubo nuevos cálculos estructurales.

La repetición instrumentada reprodujo identidades, condiciones y conflictos: 35,40 s de
ejecución del test, frente a aproximadamente 15 s de la base medida antes. Las diez pasadas
de detalle —dos del ciclo inicial y ocho alternativas— sumaron 28,40 s de tiempo transcurrido.
Una ejecución anterior registró 573,77 s y no se reprodujo; no se atribuye esa diferencia a una
causa ni se usa para estimar rendimiento. Son mediciones locales, no un SLA. La prioridad de
rendimiento sigue siendo verificar sólo la dependencia afectada y conservar una pasada global
de aceptación, sin perder equivalencia con el resultado completo.

Este incremento demuestra que explorar y conservar alternativas sí mejora el caso auditado.
No implementa todavía cambios conjuntos por nudo, reubicación de empalmes ni nuevas geometrías
de cierre. Tampoco busca reparar todas las clases de fallos físicos: selecciona miembros que
participan en interferencias. Esos operadores deben agregarse a la misma búsqueda y validarse
con más geometrías; un edificio no prueba robustez general.

Reproducción desde `web/` con WASM release:

```sh
STABILEO_GUIDED_SEARCH=8 npx vitest run --project unit --maxWorkers=2 src/lib/store/__tests__/design-guided-search-experiment.test.ts
npx vitest run --project unit --maxWorkers=2 src/lib/engine/detailing/__tests__/physical-design-search.test.ts src/lib/engine/detailing/__tests__/design-feedback-loop.test.ts
```

El experimento exige los 72 aprobados anteriores, los cuatro nuevos, ausencia de aprobados
con conflictos y mantenimiento de cobertura. Guarda la traza en `/tmp/design-guided-search.json`
y los tiempos por pasada en `/tmp/design-guided-timing.json`. Las pruebas pequeñas cubren
continuación tras rechazo, pérdida de cobertura, preservación de identidades físicas, respeto
de bloqueos/catálogos, actualización de vecinos y presupuestos.

## Incremento: reparar las filas de una jaula existente

Se agrega `redistributeLayers` como operador opcional del mismo ciclo. Transfiere una barra
entre filas inferiores adyacentes, conservando cantidad total, diámetro, número de filas,
estribos y tratamientos de extremo. Admite hasta tres filas de un mismo diámetro y exige
que las filas interiores no tengan más barras que las exteriores. No combina grupos con
cortes distintos ni modifica el armado superior reconciliado a lo largo de la viga.
El espacio inicial tiene como máximo cuatro alternativas por miembro.

Cada alternativa pasa por el verificador nominal con la nueva altura útil y recibe un
certificado propio. Después se reconstruye el detalle completo con los asientos vecinos
actualizados. La aceptación conserva cobertura y aprobaciones por identidad y rechaza
regresiones resistentes o aumentos de condiciones abiertas, igual que el operador de diámetros.
Los presupuestos cuentan también propuestas rechazadas; no se ejecutan análisis estructurales.

### Que una alternativa llegue a la geometría

El primer ensayo de redistribución verificó ocho propuestas nominales y produjo ocho detalles
idénticos: `beamGroups` transmitía cantidad y diámetro, y el generador volvía a repartir las
barras sobre las posiciones compartidas de coordinación. Cambiar las filas nominales no
cambiaba la jaula construida.

La reparación ahora declara `regions.preserveBottomRows`. El materializador conserva esas
poblaciones de filas y las dispone sobre asientos propios de la cara inferior. Esta decisión
forma parte del hash del armado y se persiste junto al candidato aceptado. Un patrón que no
cabe o que este camino no puede representar permanece sin verificar; no se transforma
silenciosamente en otro patrón aprobado. Las líneas dibujadas explícitamente conservan su
precedencia y requieren un operador de línea para cambiarlas.

No se fuerza esta política en todo el modelo: el ensayo global redujo los conflictos a 2294,
pero dejó sólo 66 aprobados y agregó condiciones de generación y empalme. Se descartó. El
operador aplica la política por miembro, con una comprobación completa antes de conservarla.

### Elección de cierres sobre geometría materializada

El selector de los cuatro cierres existentes ahora construye los mismos segmentos que emite
y mide la distancia al segmento completo de cada gancho, usando el muestreador geométrico
compartido con colisiones. Ya no considera el desplazamiento axial del gancho como separación
frente a una barra longitudinal que continúa por esa zona. Conserva la preferencia de
alternancia cuando las diferencias quedan dentro del error de cuerda del muestreo.
No cambia radios, ángulos, extensiones ni umbrales de aceptación del detector final.

La regresión incluye 126 secciones y evalúa exhaustivamente las cuatro esquinas mediante
el medidor 3D independiente del selector. También comprueba rotación, traslación y cambio
de identificadores. La prueba incluye una sección con barra interior Ø10 en coordenadas
(-100, -185) mm: el selector anterior escogía una separación de −0,716 mm aunque existía
otra esquina que despejaba la barra. Corregir esa elección no aumenta por sí solo los
aprobados del edificio de referencia.

### Resultado y reproducción

Sobre el estado de 76 aprobados obtenido por la búsqueda de diámetros, ocho pruebas completas
del nuevo operador aceptaron la viga **227**, con una distribución inferior **7+4**, y rechazaron
siete propuestas. Se conservaron los mismos 76 aprobados y la cobertura de los 408 miembros.
Los conflictos bloqueantes bajaron de **2066 a 1992** y los totales de **2391 a 2320**;
las restantes clases de condiciones abiertas conservaron sus conteos. No se obtuvieron nuevas
aprobaciones completas: reducir conflictos pendientes no equivale a cerrar el diseño de la viga.

La alternativa de la viga 225 bajaba el total a 1948 conflictos, pero bloqueaba la columna 43
y se rechazó. Las de las vigas 177 y 189 también reducían conflictos, pero no superaban la
comprobación completa. Estas decisiones muestran por qué el conteo de choques no basta.

Activación sobre el armado actual:

```ts
detailingStore.generate({ physicalSearch: {
  maxDetailingRuns: 8,
  maxMemberSearches: 64,
  operators: ['redistributeLayers'],
} });
```

Omitir `operators` conserva la búsqueda de familias de diámetros. Se puede proporcionar una
lista ordenada de ambos operadores, con presupuesto compartido; se acepta como máximo una
reparación por miembro en cada barrido. El modo automático y la interfaz no se modifican.

Reproducción desde `web/`, con WASM release:

```sh
STABILEO_LAYER_SEARCH=8 npx vitest run --project unit --maxWorkers=1 src/lib/store/__tests__/design-layer-search-experiment.test.ts
```

El experimento guarda `/tmp/design-layer-search.json`, con identidades, condiciones, intentos,
tiempo transcurrido y CPU por pasada. Comprueba además que el resultado persista al regenerar
sin ejecutar de nuevo el operador. Una ejecución anterior produjo los resultados geométricos
indicados pero excedió el límite de tiempo del test; no se usa para afirmar rendimiento.

La repetición instrumentada reprodujo los 76 aprobados por identidad, los 1992 conflictos
bloqueantes y las ocho decisiones. La etapa nueva tomó 220,76 s transcurridos y 76,85 s de CPU;
sus nueve reconstrucciones (una inicial y ocho alternativas) sumaron 218,12 s y 75,92 s de CPU.
Las diez reconstrucciones de la búsqueda anterior ya habían consumido 625,57 s transcurridos
y 131,97 s de CPU. El test completo terminó por su límite de 600 s, con 985,60 s registrados
en el cuerpo del test; por tanto, **la prueba integral no está verde**. Había otras suites
ejecutándose en la misma máquina y una carga alta; estas observaciones no aíslan la causa
de cada demora ni establecen un tiempo normal. Las 170 pruebas dirigidas de los módulos
afectados pasaron y el chequeo de tipos no agregó errores (442 existentes frente a 443 de
baseline). Se mantiene el incremento en draft hasta completar una corrida integral estable.
