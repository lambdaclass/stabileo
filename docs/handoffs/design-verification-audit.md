# Fallos de detallado y estrategia de búsqueda del diseño

Auditoría del 21 de octubre de 2026 sobre PR536, revisión `8509b272d`, con el ejemplo
`rc-design-frame` y su declaración lateral por defecto. El problema principal es la distancia
entre las alternativas que explora el diseño y las geometrías que finalmente construye.
La prioridad es cerrar esa distancia y medir todos los bloqueos físicos antes de ampliar
presupuestos de búsqueda.

## Filas inferiores alternativas y reapertura de búsquedas agotadas

La menor cantidad de filas que cabe dentro de la sección no necesariamente permite atravesar
los nudos. En 235–238, una propuesta de 10Ø16 superiores y 7Ø12 inferiores en una fila bajaba
795 → 772 conflictos, pero cruzaba dos barras verticales de la columna 58. Se rechazaba para
conservar esa columna aprobada. Repartir las mismas siete inferiores como **4+3** evita ese
obstáculo: la prueba dirigida acepta la línea, baja a **710 bloqueantes** y suma cuatro aprobados.
Resuelve además 14 parejas de empalme pendientes (20 → 6 en esa línea). Las nuevas
aprobadas son las columnas 56, 57, 59 y 60: las vigas modificadas todavía tienen bloqueos.

`harmonizeDemandCatalog` ahora ofrece, para cada población inferior, una distribución pareja
con la cantidad mínima de filas y otra con una fila adicional, hasta el límite existente de
tres. No agrega acero por redistribuirlo. El cambio de centroide obliga a verificar otra vez
resistencia y anclajes; `preserveBottomRows` lleva esas poblaciones al detalle construido.
Las propuestas duplicadas se reconocen por fila, cantidad y diámetro, independientemente
del orden de las propiedades de los objetos.

La guía por congestión considera también reducir la población máxima de una fila. Las
alternativas superiores no se redistribuyen de esta manera: la coordinación actual vuelve
a disponerlas y no conserva sus poblaciones propuestas. Enumerar variantes que después se
pierden sólo consume presupuesto. La prueba inicial de balanceo sin permitir una fila adicional
no mejoró 795/180; abrir la cantidad de filas fue el cambio que hizo progresar la búsqueda.

También había rechazos que quedaban obsoletos: las alternativas consumidas de una línea no
se volvían a probar después de modificar sus vecinos. En 248–250, una propuesta rechazada
antes del cambio de 235–238 podía mejorar el modelo después. La búsqueda por demanda ahora
reinicia las líneas aún bloqueadas que comparten un nodo con la línea modificada, incluyendo
su prefijo rechazado, y conserva las colas de las demás. La topología determina esa vecindad,
no la numeración de elementos. Las repeticiones conservan el presupuesto global y la clave de
asignación evita repetir un ensayo contra los mismos armados; el progreso estricto sigue siendo
obligatorio. Una prueba reproduce el rechazo, el cambio del vecino y la aceptación de exactamente
la misma propuesta dentro de tres detallados y siete verificaciones nominales.

El nuevo operador opt-in `retryExhausted` vuelve a dimensionar una vez por miembro agotado,
leyendo los vecinos retenidos y actualizando tanto sus jaulas como la presencia de barras.
Respeta miembros bloqueados por el usuario, excluye tramos compuestos y propuestas biaxiales,
y comparte los presupuestos con los otros operadores. Sólo instala una recuperación que
verifique en su geometría final, sin bloqueos físicos propios ni regresiones sobre los demás.
No amplía el presupuesto interno de `designMember` ni declara inviable una búsqueda fallida.

En el estado publicado de 795, reabrir los 35 agotados recupera nominalmente 324 y 327,
pero sus detallados producen 859 y 863 bloqueantes y bloquean respectivamente las columnas
111 y 115. Ambos se rechazan y se conserva íntegro el estado inicial. Los otros 33 siguen
agotados: 28 tienen congestión entre sus restricciones, 11 anclaje y cuatro flexión (pueden
coexistir). Son 35 búsquedas nominales, 1722 verificaciones y dos detallados; el test con
regeneración pasa en 28,23 s. Esto demuestra por qué una recuperación nominal requiere el
mismo control físico que cualquier otro cambio.

Resultado final sobre el audit publicado de `7451f330a`, con nuevo análisis de los 408 elementos:

| Variante desde 795/180 | Detallados | Verificaciones nominales | Aprobados | Bloqueantes |
| --- | ---: | ---: | ---: | ---: |
| Filas alternativas sin reabrir rechazos vecinos | 84 | 512 | 184 | 710 |
| Filas alternativas y reapertura de líneas vecinas, retenida | 86 | 510 | 184 | 703 |

La versión retenida acepta 235–238 (7+3 Ø16 superiores, 4+3 Ø12 inferiores) y 248–250
(4Ø16 por cara). En 248–250, la misma propuesta llevaba a 841 bloqueantes antes de cambiar
235–238 y a 703 después: el rechazo anterior no era válido contra las nuevas jaulas.
El resultado conserva las 180 identidades publicadas y suma las cuatro columnas indicadas:
**118 columnas y 66 vigas aprobadas**, 176 fallidos, 35 agotados y 13 provisionales. Ningún
aprobado participa en un conflicto bloqueante. En total se resuelven 16 parejas de empalme
pendientes (294 → 278). Las dos variantes de la tabla son corridas desde la misma base.

La corrida retenida termina por presupuesto nominal: la próxima línea no cabe en las dos
verificaciones restantes del límite 512. Registra 69 rechazos nominales, 80 regresiones,
cuatro casos sin progreso y dos aceptaciones, sin análisis estructurales adicionales dentro
de la búsqueda. La reconstrucción, búsqueda y regeneración exacta pasan en **203,99 s** locales;
no se repiten las búsquedas históricas desde cero. Reabrir los 35 agotados después del cambio
de 235–238 vuelve a rechazar las dos recuperaciones físicas y conserva 710/184 (31,03 s).

Pasan **121 pruebas dirigidas en cuatro suites**. Typecheck no agrega errores (442 existentes
frente a baseline 443). Las exploraciones iniciales de balanceo sin una fila adicional no
mejoraron el modelo; sus barridos amplios excedieron el timeout y no se cuentan como validación
aprobada. Las mediciones retenidas de esta sección sí terminan y pasan, incluida la regeneración.

Reproducción general medida desde `web/`:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-demand-accepted.json STABILEO_REPAIR_OPERATOR=harmonizeDemandCatalog STABILEO_REPAIR_RUNS=128 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-rows-requeue-final.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

Reproducción de la mejora dirigida desde `web/`:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-demand-accepted.json STABILEO_REPAIR_OPERATOR=harmonizeDemandCatalog STABILEO_REPAIR_TARGETS=235,236,237,238 STABILEO_REPAIR_RUNS=32 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-extra-bottom-row.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

`STABILEO_REPAIR_TARGETS` limita sólo el experimento mediante los bloqueos de miembros del
motor; no modifica las reglas de aceptación. `STABILEO_REPAIR_REOPEN=1` registra propuestas
nominales sin instalarlas; `STABILEO_REPAIR_OPERATOR=retryExhausted` prueba también el detalle.

## Convergencia: usar los rechazos y evitar el crecimiento obligatorio del armado

Un diseño terminado debe verificar; un candidato rechazado durante la búsqueda no es un
diseño terminado. El rechazo debe aportar una restricción para la siguiente propuesta. Tampoco
se puede declarar una sección inviable porque se agotó un presupuesto o porque fallaron las
alternativas implementadas: esa afirmación requiere una prueba de insuficiencia.

Los catálogos anteriores conservaban como piso el área máxima del armado retenido. Después
de aceptar una barra adicional, las siguientes pasadas no podían volver a reducirla. Esa regla
puede aumentar la congestión y excluir soluciones más livianas que resisten las cargas.

El operador opt-in `harmonizeDemandCatalog`:

- Calcula semillas por cara a partir de las solicitaciones, usando `computeBeamSeed` y
  `seedAreaFor`. Considera familias iguales o distintas entre caras. La semilla es una guía,
  no una capacidad certificada ni un mínimo obligatorio: prueba la población estimada, una
  barra más y una menos, dentro de los límites existentes de filas, catálogos y secciones.
- Conserva las comprobaciones fallidas con sus restricciones y valores. Un fallo resistente
  prioriza alternativas con más área en la cara afectada; un fallo de anclaje prioriza menor
  diámetro o menos filas; uno de congestión también puede priorizar menos barras. Prefiere
  conservar la otra cara cuando no está implicada. Sólo reordena candidatos; no los certifica
  ni elimina los restantes. Sigue alternando líneas y respetando el presupuesto.
- Cuando el verificador pide un gancho inferior, reutiliza `completeAnchorage`: lo incorpora
  al armado y hace una segunda verificación acotada. El gancho debe llegar al detallado real
  y superar la comprobación completa de geometría. No se dan por resueltos pedidos de ganchos
  superiores que ese mecanismo no implementa. Se contabilizan ambas llamadas al verificador.
- Además de los controles globales existentes, exige disminuir estrictamente una medida
  ordenada: miembros físicamente bloqueados, conflictos bloqueantes, condiciones abiertas y
  parejas de empalme sin resolver. Los ensayos guardan la medida anterior y posterior.
  Trasladar un choque entre miembros que ya fallaban, sin mejorar esos totales, se rechaza.

La disminución estricta evita ciclos de reparaciones aceptadas en este operador. **No prueba
convergencia a un edificio verificado**: quedan fuera configuraciones que el dominio no genera,
y el presupuesto puede terminar antes de explorarlas. `budget` conserva ese significado. Los
35 agotados nominales y los 13 provisionales biaxiales tampoco se convierten en aprobados por
mejorar la geometría de los demás.

Para cerrar los casos restantes, la siguiente ampliación debe responder al tipo de obstáculo:
reabrir los agotados nominales cuando cambian las jaulas vecinas (la búsqueda física actual
excluye miembros sin un armado nominalmente verificado); resolver conjuntamente las líneas
que comparten un nudo cuando una mejora desplaza el choque;
probar disposiciones completas de filas y ganchos cuando cambia la coordinación; y recurrir
a otras soluciones de anclaje o a cambios de sección, con nuevo análisis, cuando el espacio
disponible resulte insuficiente. Una propuesta de sección debe distinguir evidencia de capacidad
insuficiente de una búsqueda incompleta. No se relajaron verificaciones para obtener progreso.

Medición retenida del 23 de octubre, reconstruyendo el audit publicado de `6072c77bc`
con nuevo análisis de los 408 elementos:

| Estado | Aprobados | Fallidos | Conflictos bloqueantes |
| --- | ---: | ---: | ---: |
| Publicado | 177 | 183 | 819 |
| Semilla por demanda y guía por rechazo | 180 | 180 | 795 |

Conserva las 177 identidades aprobadas y suma 217–219: **114 columnas y 66 vigas aprobadas**.
Acepta cuatro líneas (217–219, 220–222, 251–253 y 239–241), con poblaciones superiores/inferiores
4/4, 4/5, 3/4 y 3/4, todas Ø16. Sus pasos dejan 812, 797, 796 y 795 bloqueantes. Ningún aprobado
participa en conflictos bloqueantes. La regeneración sin búsqueda reproduce exactamente
conflictos y veredictos. Permanecen 35 agotados y 13 provisionales; el edificio aún no verifica.

La búsqueda consume 110 detallados y 510 verificaciones nominales, sin nuevos análisis
estructurales dentro de la búsqueda, y termina por presupuesto nominal (límite 512; la próxima
línea no cabe). Registra 4 aceptaciones, 45 rechazos nominales, 95 regresiones físicas y
11 casos sin progreso. Entre las comprobaciones nominales fallidas aparecen 80 de acero mínimo,
44 de anclaje y 10 de congestión; son comprobaciones, no miembros distintos. Esta corrida no
necesitó completar ganchos: esa rama está cubierta por una prueba específica.

El prototipo con sólo semilla por demanda obtuvo 796 bloqueantes/183 aprobados; repetirlo no
mejoró el resultado. La versión retenida obtiene 795/180 desde la misma base publicada: ambas
conservan sus 177 aprobados, pero ninguna domina a la otra en todos los indicadores. La elección
prioriza los bloqueos; no se presenta el cambio como una mejora de todos los experimentos.

Pasan **109 pruebas dirigidas en cuatro suites**, incluidas continuidad de tres vanos en ambas
orientaciones con reducción de área, reparación guiada por un fallo de flexión, materialización
y nueva verificación de ganchos y rechazo de un choque meramente trasladado. Typecheck no suma
errores (442 existentes frente a baseline 443). El test de reconstrucción, búsqueda y regeneración
pasa en 251,56 s locales; no vuelve a ejecutar las búsquedas históricas desde cero.

Reproducción medida desde `web/`, con el audit publicado como entrada:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-mixed-balanced.json STABILEO_REPAIR_OPERATOR=harmonizeDemandCatalog STABILEO_REPAIR_RUNS=128 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-demand-accepted.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

La secuencia completa de `design-continuity-experiment.test.ts` admite esta etapa mediante
`STABILEO_DEMAND_CATALOG=128` después de `STABILEO_MIXED_CAGE_CATALOG=64`. Esa secuencia desde
cero no se midió de nuevo en esta revisión; la medición anterior usa el audit reconstruido.

## Diámetros distintos por cara y reparto del presupuesto

El catálogo conjunto resolvía ambas caras con el mismo diámetro. Esa restricción evita algunas
incompatibilidades de posiciones, pero descarta alternativas con barras inferiores menores,
cuyos anclajes requieren menos espacio. `harmonizeMixedCageCatalog` explora diámetros distintos
entre caras, manteniendo una familia uniforme por cara a lo largo de la línea y los mínimos de
área de cada semilla. No modifica reglas de resistencia, anclaje ni colisión.

El producto de dos catálogos requiere repartir la búsqueda: las propuestas intercalan las
familias preferidas de ambas caras y cada rechazo nominal cede el turno a otra línea. Antes,
una línea podía consumir el presupuesto nominal probando sucesivas familias inferiores con
una sola familia superior. La aceptación conserva los controles globales y las certificaciones
atómicas; se registran ambos diámetros y ambas poblaciones en cada ensayo.

Reconstrucción del audit de `a3073bdec`, resolviendo nuevamente el modelo de 408 elementos:

| Exploración | Detallados | Verificaciones nominales | Aprobados | Bloqueantes |
| --- | ---: | ---: | ---: | ---: |
| Estado publicado | — | — | 169 | 844 |
| Combinaciones secuenciales | 49 | 512 | 178 | 830 |
| Combinaciones intercaladas, retenidas | 64 | 461 | 177 | 819 |

Ambas exploraciones conservan las 169 identidades aprobadas del estado publicado. Son rutas
alternativas desde la misma base, no etapas acumulativas. Se retiene la segunda por su menor
número de conflictos; no domina a la primera en cantidad de aprobados. Termina por presupuesto
y no demuestra que se hayan agotado las soluciones. La búsqueda no repite el análisis estructural.

La versión retenida acepta cinco propuestas sobre 17 vigas: 270–272, 344–346, 208–210,
347–350 y 378–381. En 208–210, 4Ø16 superiores y 7+2 Ø12 inferiores eliminan 19 bloqueantes
y resuelven cuatro parejas de empalmes pendientes. Las ocho nuevas aprobadas son 347–350 y
378–381. El total final es **114 columnas y 63 vigas aprobadas**, 183 fallidos, 35 búsquedas
agotadas y 13 provisionales biaxiales. Ningún aprobado participa en conflictos bloqueantes.

La regeneración sin búsqueda reproduce exactamente los veredictos y conflictos. El test de
reconstrucción, búsqueda y regeneración consume 160,43 s locales. Quedan 451 pares superiores,
132 inferiores, 90 otros longitudinales y 146 longitudinal/transversal. El volumen longitudinal
generado pasa de 4,638558 a 4,655773 m³ (+0,37%); todavía no se minimiza el costo del acero.

Pasan 103 pruebas dirigidas en cuatro suites, incluidas dos integraciones de tres vanos con
diámetros distintos, en ambas orientaciones, con verificación de resistencia, continuidad,
cobertura transversal y regeneración. El test de presupuesto reproduce una primera línea que
falla nominalmente y comprueba que la segunda recibe una propuesta dentro del mismo límite.
Typecheck no agrega errores (442 existentes frente a baseline 443).

El diagnóstico de 235–238 sigue abierto. Se reprodujo una inconsistencia entre filas inferiores
preservadas y filas hipotéticas consideradas al planificar anclajes. Corregirla globalmente
cambiaba también las opciones de coordinación: subía a 952 bloqueantes y bloqueaba la columna
65, aunque el total de aprobados creciera en uno. **Esa modificación no se retuvo.** Hará falta
seleccionar y verificar la disposición completa para corregirla sin desplazar conflictos a vecinos.

Reproducción medida desde `web/`:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-cage-final.json STABILEO_REPAIR_OPERATOR=harmonizeMixedCageCatalog STABILEO_REPAIR_RUNS=64 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-mixed-audit.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

El experimento desde cero admite `STABILEO_MIXED_CAGE_CATALOG=64` después del catálogo
conjunto; la medición de esta revisión usa la reconstrucción del audit anterior. Para inspeccionar
las verificaciones nominales de todas las propuestas de una línea sin repetir la búsqueda física,
se puede agregar `STABILEO_REPAIR_PROPOSALS=235,236,237,238` y omitir `STABILEO_REPAIR_RUNS`.

## Explorar ambas caras de una línea en una misma alternativa

Armonizar sólo la cara superior deja intacta la inferior, aunque el grupo más numeroso
determina el paso de la distribución compartida. Una propuesta superior de mayor diámetro
puede quedar condicionada por las posiciones inferiores y requerir filas adicionales, con
menos espacio de anclaje. Cambiar una cara por vez no explora todas las soluciones posibles.

El operador opt-in `harmonizeCageCatalog` propone un diámetro común para ambas caras de una
línea, dimensionando sus áreas por separado. Para cada cara prueba el menor número entero
de barras que conserva el área máxima de la línea y una barra adicional. Combina como máximo
cuatro poblaciones por diámetro, con los límites de filas y catálogos existentes. Conserva
estribos y terminaciones, incluidas las instrucciones de ganchos, y persiste las filas inferiores.
Actualiza los asientos vecinos y verifica todos los miembros de la propuesta antes de generar
el edificio completo. Sólo retiene una mejora física sin nuevas regresiones ni miembros bloqueados.

La primera corrida sobre la asignación de `54a221cbb`, reconstruida con un nuevo análisis del
modelo de 408 elementos, consumió 32 detallados y 198 verificaciones nominales. Retuvo ocho
alternativas sobre 31 vigas: **920 → 848 bloqueantes**, **140 → 166 aprobados** (114 columnas
y 52 vigas). Conservó las 140 identidades anteriores y reprodujo exactamente el resultado al
regenerar sin búsqueda. Ampliar a 64 detallados y 427 verificaciones nominales retiene nueve
alternativas sobre 34 vigas y alcanza **844 bloqueantes y 169 aprobados** (114 columnas y
55 vigas). Conserva todos los aprobados anteriores, sin aprobados con conflictos bloqueantes.
La reconstrucción, búsqueda ampliada y regeneración pasan en 158,66 s locales; la búsqueda
no hace nuevos análisis estructurales y termina por presupuesto, no por agotar alternativas.

| Presupuesto de detallados | Aprobados | Bloqueantes |
| --- | ---: | ---: |
| Antes | 140 | 920 |
| 32 | 166 | 848 |
| 64 | 169 | 844 |

Por ejemplo, la línea 351–354 pasa de 8Ø12 superiores y 7Ø12 inferiores a 5Ø16 superiores y
4Ø16 inferiores. La línea 217–219 encuentra una familia común de Ø12, no necesariamente el
mayor diámetro. Las mejoras también liberan vecinos sin cambiar su armado. El volumen
longitudinal generado de todo el modelo pasa de 4,604742 a 4,638558 m³ (+0,73%); esta búsqueda
prioriza cerrar verificaciones, todavía no minimiza el costo del acero.

Pasan 98 pruebas dirigidas en cuatro suites. La integración de tres vanos reproduce un caso
que no cierra con el catálogo superior solo y sí con la propuesta conjunta; también lo prueba
con los elementos orientados al revés. Verifica resistencia, ausencia de condiciones abiertas,
continuidad física, cobertura transversal y regeneración. Las pruebas de búsqueda comprueban
la certificación atómica y el rechazo de alternativas que bloquean un vecino.

La traza del experimento libera el historial de llamadas del espía después de extraer cada
diagnóstico. Antes Vitest retenía todos los resultados de geometría en `mock.results` y agotaba
la memoria del worker al ampliar la búsqueda a 64 detallados. La repetición con la corrección
pasa sin aumentar el límite de memoria. Typecheck no agrega errores: 442 frente a baseline 443.

Quedan 467 pares superiores, 133 inferiores, 97 otros longitudinales y 147
longitudinal/transversal. La reducción neta es de 76: 78 pares superiores menos y dos
inferiores más, sin bloquear nuevos miembros. Las propuestas de 235–238 siguen rechazadas:
las primeras seis fallan nominalmente en 235 y 238; la séptima (18Ø12 superiores, 11Ø12
inferiores) pasa nominalmente pero aumenta a 966 bloqueantes el estado entonces retenido,
con más solapes, separaciones incumplidas y condiciones de generación. No se retiene esa
mejora parcial de empalmes. El edificio completo aún tiene 191 fallidos, 35 búsquedas agotadas
y 13 provisionales biaxiales.

Reproducción desde el audit de 920 bloqueantes, en `web/`:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-preserve-final-audit.json STABILEO_REPAIR_OPERATOR=harmonizeCageCatalog STABILEO_REPAIR_RUNS=64 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-cage-audit.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

La secuencia desde cero admite una etapa final con `STABILEO_CAGE_CATALOG`, después de
`STABILEO_ROW_PRESERVATION`. La medición de esta sección corresponde a reconstruir el audit
anterior, resolver nuevamente sus fuerzas y ensayar el detalle completo; no a repetir las etapas
de búsqueda que ya produjeron ese audit.

## Conservar las filas verificadas antes de redistribuirlas

La coordinación compartía posiciones entre los grupos superiores e inferiores. Conservaba
la cantidad y el diámetro totales, pero podía cambiar las poblaciones por capa que el diseño
había verificado. La lectura de los tramos rectos en el centro de cada viga muestra:

| Viga | Inferior verificado | Inferior generado antes | Inferior retenido ahora |
| --- | --- | --- | --- |
| 224 | 8+5 Ø10 | 7+6 Ø10 | 8+5 Ø10 |
| 225 | 8+5 Ø10 | 6+6+1 Ø10 | 8+5 Ø10 |
| 328 | 8+2 Ø10 | 6+4 Ø10 | 8+2 Ø10 |

El operador opt-in `preserveBottomRows` ofrece la distribución ya verificada con la instrucción
de conservar sus filas durante el detallado. No aumenta área, cambia diámetros ni modifica
ganchos o terminaciones. Es una alternativa física que se vuelve a verificar: no se impone a
todos los miembros porque la disposición propia puede chocar con sus vecinos. Se aplica a
filas uniformes de dos o tres capas; omite filas ya preservadas, grupos múltiples, tramos
compuestos y miembros bloqueados por el usuario. Comparte el presupuesto y los controles
globales de regresión de los operadores existentes.

Sobre el audit de `f430f371c`, `preserveBottomRows` seguido de `redistributeLayers` dentro de
cada miembro produce estas aceptaciones, con 16 detallados y 16 verificaciones nominales:

| Propuesta aceptada | Bloqueantes después |
| --- | ---: |
| Estado anterior | 1092 |
| Conservar 225 en 8+5 | 974 |
| Conservar 224 en 8+5 | 960 |
| Conservar 328 en 8+2 | 926 |
| Redistribuir 227 a 6+5 | 920 |

Son **172 bloqueos menos (15,8%)**, conservando las 140 identidades aprobadas y sin nuevos
análisis estructurales durante la búsqueda. No agrega miembros aprobados: los afectados
todavía tienen otros conflictos. Ningún aprobado participa en bloqueos y la regeneración sin
búsqueda reproduce exactamente el resultado. La restauración de filas por sí sola llega a 926;
los últimos seis bloqueos los elimina el operador de redistribución existente.

Esto corrige el diagnóstico anterior de 225: las cuatro esquinas chocaban en su jaula
**generada 6+6+1**, no se había demostrado que la jaula nominal 8+5 fuera inviable. Conservar
8+5 permite cerrar los estribos sin los choques que la alternativa 7+6 producía en columna 43.
Análogamente, cambiar la distribución inferior de 328 deja una esquina libre para el cierre
que antes chocaba con sus barras superiores. Probar el armado ya dimensionado antes de
modificarlo resulta esencial en estos casos.

El resultado retenido tiene 545 pares superiores, 131 inferiores, 97 otros longitudinales y
147 longitudinal/transversal: 920 en total. Las líneas superiores de 235–238 siguen siendo
la mayor concentración. Persisten las condiciones de empalme, generación y resistencia
identificadas abajo. No se afirma haber agotado las alternativas: la búsqueda llega a su
presupuesto de 16 detallados.

Pasan 138 pruebas dirigidas en cinco suites, incluyendo la reproducción 8+5 → 6+6+1, la
conservación de grupos y anclajes y el rechazo de una mejora local que bloquea un vecino.
Typecheck no agrega errores (442 existentes frente a baseline 443).

La secuencia completa desde cero también pasa con **140 aprobados y 920 bloqueantes**,
conserva las 140 identidades y reproduce los veredictos y conflictos al regenerar. La etapa
nueva acepta los mismos cuatro miembros de la reconstrucción. El test completo consumió
899,79 s en esta ejecución local, incluyendo todas las etapas previas; ese tiempo no es una
garantía de rendimiento. El timeout del experimento con la etapa adicional deja margen para
máquinas más lentas. La búsqueda de conservación/redistribución mantiene el límite de
16 detallados y 128 verificaciones nominales; consumió 16 de cada una.

Reproducción completa desde `web/`, agregando la nueva etapa al final:

```sh
STABILEO_CONTINUITY_EXPERIMENT=64 STABILEO_BOTTOM_EXPERIMENT=1 STABILEO_CATALOG_EXPERIMENT=64 STABILEO_ROW_PRESERVATION=16 STABILEO_CONTINUITY_AUDIT=/tmp/design-preserve-audit.json npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
```

Para continuar directamente desde el audit anterior, el experimento admite operadores
separados por comas y mantiene el orden indicado:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-generator-final-audit.json STABILEO_REPAIR_OPERATOR=preserveBottomRows,redistributeLayers STABILEO_REPAIR_RUNS=16 STABILEO_REPAIR_AUDIT=/tmp/design-preserve-audit.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

## Correcciones del generador — 23 de octubre

Tres errores reproducidos en la generación de geometría:

- **Zonas transversales de pocos milímetros.** Las intersecciones de requisitos de corte y
  terminación de barras dejaban intervalos de 1–3,75 mm. Distribuir estaciones uniformemente
  dentro de cada intervalo no evita colocar dos jaulas demasiado cerca de su límite. Ahora
  una zona más corta que la envolvente axial del conjunto se integra con una contigua de
  igual diámetro, ramas, límite transversal y fila, aplicando el paso más exigente a toda
  la unión. Se prefiere el vecino que agrega menos conjuntos. No se unen huecos ni jaulas
  incompatibles. La instrucción resultante alimenta tanto la generación como el conteo
  independiente de cobertura; no se elimina un estribo después de comprobarlo.
- **Alternativa simétrica alrededor de una pareja asimétrica.** La coordinación puede
  desplazar una barra superior exterior hacia adentro para atravesar un nudo. Si el resto
  del grupo requería su disposición propia, el generador usaba el mayor semiancho de la
  pareja y lo reflejaba al otro lado. Conservaba la barra exterior desplazada, dejando sólo
  20,02 mm libres con la siguiente en 235/238, frente a 26,67 mm requeridos. La distribución
  alternativa ahora usa el ancho y el centro entre las dos barras reales. La traza antes
  y después de coordinar el piso confirma que el déficit nacía en el generador.
- **Separación de otro diámetro.** `placeGroup` aplicaba a todos los grupos el mínimo calculado
  para las barras inferiores. Con inferiores Ø12 y superiores Ø32 podía colocar seis barras
  superiores en una fila cuyo hueco era menor que 32 mm. Cada grupo ahora consulta la regla
  con su propio diámetro. El caso de regresión en una viga de 400 mm usa cinco barras en la
  primera fila y una en la segunda, conservando las seis. Este error no aporta una reducción
  al audit retenido: sus grupos superiores no llegan a Ø32.

La reconstrucción independiente del armado de `d605bc305` distingue el efecto de los cambios:

| Cambio acumulado sobre el mismo armado | Aprobados | Bloqueantes |
| --- | ---: | ---: |
| Audit anterior | 140 | 1101 |
| Integración de zonas transversales diminutas | 140 | 1097 |
| Distribución superior entre los extremos reales | 140 | 1092 |
| Otro barrido del operador inferior existente, 16 detallados como máximo | 140 | 1086 |

Las tres reconstrucciones conservan todas las identidades aprobadas y reproducen exactamente
sus resultados al regenerar. Desaparecen los cuatro choques transversal/transversal y las
cinco separaciones superiores del mismo miembro diagnosticadas abajo. El barrido inferior
acepta otra vez el cambio 6+5 de 227; sigue rechazando 225 por los nuevos choques con la
columna 43. Sus nuevas barras centrales coinciden con una barra vertical: además de conservar
las cantidades por fila, la próxima propuesta debe coordinar sus posiciones con ambos nudos.
No se relajan los controles para aceptar esa regresión.

La secuencia completa desde cero, con los mismos presupuestos anteriores, también termina
en **140 aprobados y 1092 bloqueantes**. Conserva exactamente las 140 identidades: 114 columnas
y 26 vigas. Quedan 220 fallidos, 35 búsquedas agotadas y 13 provisionales. Ningún aprobado
participa en un conflicto bloqueante y la regeneración sin búsqueda reproduce exactamente
veredictos y conflictos. El catálogo ejecuta 64 detallados y 322 verificaciones nominales,
sin nuevos análisis estructurales. La prueba completa pasa en 525,06 s en esta ejecución local.
El resultado 1086 de la tabla sigue siendo una continuación adicional, no el benchmark desde cero.

Pasan 155 pruebas dirigidas en diez suites; las seis regresiones nuevas fallan contra
el generador de `43605a150` y pasan con las correcciones. Typecheck sin errores nuevos
(442 existentes, baseline 443). La integración desde cero exige conservar las 140 identidades
del audit anterior.

La [CI de la revisión anterior `43605a150`](https://github.com/lambdaclass/stabileo/actions/runs/39852428018)
ya presenta fallos en las suites web: exportación CAD/contención, conservación de barras al
tomar como dibujado y expectativas de estados de verificación. Las pruebas dirigidas de esta
sección no sustituyen esa CI ni implican que esos fallos estén resueltos.

## Diagnóstico de los 1101 bloqueos retenidos

Sobre el armado final de `d605bc305`, con fuerzas resueltas nuevamente y regeneración exacta.
Esta sección diagnostica la asignación de 140 aprobados; los experimentos indicados abajo
son continuaciones independientes de esa misma asignación.

### Qué está chocando

| Geometría del par | Bloqueos |
| --- | ---: |
| Barras superiores entre sí | 550 |
| Barras inferiores entre sí | 147 |
| Otros pares longitudinales | 103 |
| Barra longitudinal con pieza transversal | 297 |
| Dos piezas transversales | 4 |
| Total | 1101 |

Son 836 interpenetraciones y 265 déficits de separación. Dentro de los 550 pares superiores,
172 son empalmes registrados, 196 son otras barras de tramos paralelos, 177 corresponden a
líneas cruzadas y cinco son barras del mismo miembro. Los empalmes registrados suman 276
incluyendo 104 inferiores; no se suman nuevamente a la tabla.

Los 297 choques longitudinal/transversal se reparten en 146 contra la jaula del propio miembro
(incluidas barras fusionadas), 125 contra la del vecino y 26 contra piezas del nudo. La escalera
de traslaciones omite pares con piezas transversales: los 301 pares que incluyen esas piezas
no reciben propuestas de desplazamiento. Eso conserva contención y recubrimiento, pero requiere
un operador que reconstruya la jaula o la distribución de barras. Repetir la escalera no lo aporta.

### Causas medidas y ensayos que las distinguen

1. **Cierre incompatible con todas las esquinas disponibles.** En una sección de la viga 225,
   las cuatro ubicaciones del cierre arrojan −4,251 mm de separación mínima. En la 328, la mejor
   de las cuatro arroja −3,837 mm. El selector ya toma una de las mejores alternativas: cambiar
   sólo la orientación no soluciona esas secciones. En 225 hay 85 conflictos propios, repetidos
   a lo largo del miembro. Los 33 propios de 328 son principalmente del armado superior,
   no inferior: 32 contra estribos y uno entre barras superiores.
2. **Una mejora local puede bloquear el nudo vecino.** Redistribuir el inferior de 225 de 8+5
   a 7+6 barras reduce el total de 1101 a 983, pero crea dos interpenetraciones de aproximadamente
   15 mm con la barra vertical `15000:0-L2-v5` de la columna 43, antes aprobada. Además aumenta
   una condición de empalme sin disponer. El algoritmo lo rechaza correctamente. La alternativa
   7+3 de 328 baja a 1071 sin perder miembros aprobados, pero aumenta la categoría de conflictos
   por separación; también se rechaza. Hace falta evaluar cambios coordinados antes de aceptar
   el conjunto, conservando los controles actuales.
3. **Las familias más gruesas tropiezan con anclaje y congestión.** Una segunda búsqueda superior,
   con límite de 64 detallados y 512 verificaciones, no mejora los 1101. Realiza 59 detallados y
   511 verificaciones: 99 propuestas fallan nominalmente, 56 se rechazan tras detallar y tres
   no producen avance. Al repetir solamente la verificación nominal de esas 99 propuestas,
   se reproducen exactamente los miembros rechazados. 89 propuestas fallan por anclaje, 20
   por congestión y dos por flexión; las categorías se solapan. Entre los rechazos físicos
   aparecen nuevos déficits de recubrimiento, empalmes y bloqueos de columnas. Aumentar sólo
   el presupuesto no resuelve esta ejecución ni demuestra que se agotaron las alternativas.
4. **Cuatro estaciones de estribos se solapan.** En 358 hay dos conjuntos de zonas contiguas
   a 1 mm; en 356 y 381 aparecen dos estaciones de la misma zona separadas aproximadamente
   3,8 mm, y en 378 dos zonas se encuentran a 3,7 mm. Son interferencias del posicionamiento
   longitudinal de los estribos, distintas de los cierres y trabas corregidos anteriormente.
   La reserva de la envolvente debe aplicarse también entre conjuntos y al rematar zonas,
   conservando cobertura y separación máxima.
5. **Cuatro vigas carecen de margen resistente ante la geometría final.** Las 192 y 195 pasan
   nominalmente con utilización 0,992, pero con la tolerancia de profundidad de 15 mm quedan
   en 1,029: demanda 405,53 kN·m frente a capacidad 394,03. Las 262 y 265 pasan de 0,973 a
   1,005: 300,51 frente a 299,01 kN·m. En los cuatro registros no hay desplazamiento adicional
   de capas; la tolerancia final basta para hacerlas fallar. Los otros 13 registros resistentes
   fallidos son los provisionales biaxiales ya conocidos. Aumentar acero de forma general no
   explica ni resuelve los 220 miembros fallidos.

Los 1101 no incluyen 234 conflictos clasificados como marginales. Entre los 220 miembros
fallidos hay 18 sin conflictos de las categorías overlap/clearance: nueve mantienen condiciones
de empalme de columna y otros nueve condiciones de choques marginales. Dos de estos últimos,
177 y 189, además tienen una condición de generación por contención en un doblez. Reducir sólo
el contador de conflictos no basta para aprobarlos; las condiciones abiertas también deben cerrar.

### Mejora pequeña encontrada y orden de trabajo

El barrido de redistribución inferior considera nueve alternativas y acepta una: cambiar la
viga 227 a filas 6+5 reduce **1101 → 1095**, conserva las 140 aprobaciones y se regenera exactamente.
No agrega aprobados. Es una continuación medida, no un nuevo resultado de la secuencia completa
desde cero ni una modificación del diseño por defecto.

Los siguientes cambios deben abordar causas distintas:

- Distribuir estaciones transversales considerando la envolvente de conjuntos contiguos.
  Casos de aceptación: 356, 358, 378 y 381, sin perder cobertura ni superar el paso máximo.
- Incluir factibilidad de cierres en las semillas y ampliar familias/distribuciones inferiores.
  Rechazar barato una sección que choca en las cuatro esquinas, antes del detallado del edificio.
- Usar el rechazo como guía de un vecindario: por ejemplo, 225 y columna 43, con sus empalmes.
  Proponer el cambio compuesto y verificarlo completo; ninguna alternativa intermedia se publica.
- Diseñar la transición entre patrones y el espacio ocupado en la jaula receptora. La continuidad
  uniforme ayuda, pero sus alternativas actuales no resuelven las 276 parejas de empalme en conflicto.
- Considerar la profundidad final y su tolerancia al dimensionar la semilla, para que las cuatro
  vigas resistentes no dependan de un margen nominal insuficiente.

Reproducción de las continuaciones desde `web/`, usando el audit de la ejecución completa:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-continuity-audit.json STABILEO_REPAIR_CATALOG=64 STABILEO_REPAIR_AUDIT=/tmp/design-catalog-again.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
STABILEO_REPAIR_SNAPSHOT=/tmp/design-continuity-audit.json STABILEO_REPAIR_OPERATOR=redistributeLayers STABILEO_REPAIR_RUNS=16 STABILEO_REPAIR_TRACE=1 STABILEO_REPAIR_AUDIT=/tmp/design-rows-trace.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
STABILEO_REPAIR_SNAPSHOT=/tmp/design-continuity-audit.json STABILEO_REPAIR_NOMINAL_AUDIT=/tmp/design-catalog-again.json npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
STABILEO_CLOSURE_AUDIT=/tmp/design-continuity-audit.json npx vitest run --project unit src/lib/engine/detailing/__tests__/saved-closure-diagnosis.test.ts
```

La traza compara cada propuesta con la asignación restaurada y conserva cambios, causas de
regresión respecto de esa asignación, miembros que adquirirían bloqueos
y los conflictos/condiciones que los bloquean, además de los chequeos resistentes finales.
La repetición nominal requiere un barrido sin aceptaciones, para no usar vecindarios distintos.

## Ampliación: espacio de las trabas y alternativas nuevas del catálogo

La ejecución completa desde cero termina con **140 aprobados y 1101 conflictos bloqueantes**:
441 bloqueos menos que `6e939b609` (28,6%) y 56 aprobaciones adicionales. Conserva las 84
identidades anteriores; son 114 columnas y 26 vigas, frente a 81 y tres. Ningún aprobado
participa en un conflicto bloqueante. Quedan 220 fallidos, 35 búsquedas agotadas y 13 provisionales.
La regeneración sin búsqueda reproduce exactamente todos los veredictos y conflictos.

Dos reservas geométricas omitían parte del acero que se construye. El cierre del estribo
sobresale medio diámetro respecto de su plano: separar la primera traba solamente un diámetro
dejaba interpenetraciones. Además, la banda libre del nudo se aplicaba a la estación del
conjunto, aunque las piezas extremas sobresalen de ella. Ahora se reserva la envolvente axial
completa, incluidos los cierres, tanto al separar piezas como al colocar conjuntos en el nudo.
Se conserva el paso entre piezas equivalentes de conjuntos sucesivos. Si no cabe el conjunto,
se mantiene una condición de generación abierta.

El operador opt-in `harmonizeTopCatalog` explora familias comunes que no necesitan existir en
otra viga. Parte del área superior máxima de la línea y propone el menor número de barras
que la cubre en cada diámetro permitido, más una barra para explorar otra distribución.
El área sólo guía la propuesta: resistencia, anclaje y geometría final deben verificarse.
Se conservan los grupos, terminaciones, catálogos y exclusiones de los operadores anteriores.
Sólo se seleccionan líneas con conflictos que involucren sus barras superiores reales,
incluidas las fusionadas. Cada línea recibe un ensayo físico antes del segundo ensayo de otra;
los rechazos nominales siguen siendo baratos y consumen su presupuesto explícito.

En esta ejecución, las reparaciones anteriores, ya con las reservas corregidas, llegan a
95 aprobados y 1310 bloqueos. El catálogo superior acepta 12 líneas y termina con 140/1101:
64 detallados, 322 verificaciones nominales y cero reanálisis estructurales; se alcanza el
presupuesto, no el agotamiento del catálogo. La etapa inferior previa completa su barrido
con 52 detallados y 190 verificaciones nominales. El test completo consume 561,14 s en una
ejecución local; el tiempo incluye todas las etapas y no es una garantía de rendimiento.

La reconstrucción del armado guardado de `6e939b609` permite separar las causas:

| Cambio acumulado sobre el armado retenido | Aprobados finales | Conflictos bloqueantes |
| --- | ---: | ---: |
| Estado anterior | 84 | 1542 |
| Reserva del cierre junto a las trabas | 88 | 1454 |
| Reserva del conjunto completo dentro del nudo | 98 | 1442 |
| Catálogo superior, 64 ensayos físicos | 140 | 1234 |

Esta reconstrucción conserva las 84 identidades y termina con 114 columnas y 26 vigas aprobadas.
Su asignación es distinta de la obtenida desde cero: corregir las reservas antes de los
operadores anteriores también cambia qué alternativas se aceptan. Los conteos de aprobados
coinciden, pero no todas las identidades nuevas; ambas conservan las 84 del estado anterior.
Las cuatro vigas que libera la corrección del nudo son 191, 214, 215 y 216. El catálogo acepta
12 líneas, realiza 357 verificaciones nominales y llega al presupuesto de 64 detallados;
no ejecuta nuevos análisis estructurales. La regeneración de ese armado reproduce exactamente
los aprobados y los conflictos. La prueba de restauración escribe solamente armados aceptados
o provisionales biaxiales; las búsquedas agotadas no reciben su mejor candidato rechazado.

Las regresiones nuevas miden directamente separación entre piezas, envolvente de cierres,
contención y paso para diámetros de 6, 8 y 10 mm, ambos cierres y marcos rotados. Otra mide
la separación de cada pieza transversal del nudo respecto de las barras horizontales de las
vigas. Un octavo caso pequeño con solver real cierra tres luces de 6 m usando 5Ø16 en lugar
de los patrones iniciales 7Ø12 y 8Ø12. Las pruebas de búsqueda comprueban conservación global,
presupuestos, selección por barras en conflicto y alternancia entre líneas.
Las diez suites dirigidas suman 174 pruebas aprobadas. La integración de 408 miembros pasa
y fija 140 aprobados, 26 vigas y 1101 bloqueos como regresión de esta secuencia, además de la
conservación por identidad y la regeneración exacta. Typecheck: 442 errores existentes frente
a baseline 443, sin errores nuevos.

Reproducción completa desde `web/` (incluye todas las etapas anteriores):

```sh
STABILEO_CONTINUITY_EXPERIMENT=64 STABILEO_BOTTOM_EXPERIMENT=1 STABILEO_CATALOG_EXPERIMENT=64 STABILEO_CONTINUITY_AUDIT=/tmp/design-continuity-audit.json npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
```

Para investigar una asignación retenida sin repetir la búsqueda anterior:

```sh
STABILEO_REPAIR_SNAPSHOT=/tmp/design-continuity-audit.json STABILEO_REPAIR_CATALOG=64 npx vitest run --project unit src/lib/store/__tests__/design-next-conflicts-experiment.test.ts
```

Este segundo comando vuelve a resolver fuerzas, restaura el armado, reconstruye y verifica
todo el detalle; guarda su evidencia en `/tmp/design-next-conflicts.json`. No reemplaza la
prueba completa desde cero. La búsqueda sigue siendo opt-in y acotada: completar este
presupuesto no demuestra que las alternativas estén agotadas ni que el edificio verifique.

Los **1101 conflictos de la ejecución completa** se reparten en 276 parejas de empalme
registradas, 524 pares longitudinales adicionales, 297 pares longitudinal/transversal y cuatro
pares transversales. Las concentraciones siguientes están en el armado inferior de 225
(85 conflictos propios), en el de 328 (33), y en transiciones que penetran la jaula del tramo vecino.
Requieren operadores sobre la posición inferior y las transiciones; cambiar otra vez el acero
superior no aborda esas causas.

## Ampliación: continuidad superior e inferior por líneas completas

La búsqueda por parejas dejaba tramos fuera del reemplazo: una unión ya fusionada no tiene
registro de empalme. Los nuevos operadores `harmonizeTopLine` y `harmonizeBottomLine` usan
las líneas del coordinador y las transiciones materializadas, comprueban conectividad y
colinealidad y verifican todos sus miembros como un paquete. Incluyen uniones ya continuas;
no incorporan vigas cruzadas, solapadas ni ramas ambiguas. Los catálogos se intersectan y se
preservan las terminaciones de cada miembro, incluidos los ganchos inferiores explícitos.

También se corrigió la medida de avance: una condición agrupada puede representar ocho
parejas mal colocadas. Pasar de ocho a dos es una mejora real aunque siga abierto un aviso.
Se cuenta esa reducción sin alterar la verificación física ni las protecciones contra regresión.
Los ensayos ahora registran qué miembro perdió resistencia o qué categoría de bloqueo aumentó.

### Resultado medido en los 408 miembros

| Etapa | Aprobados finales | Conflictos bloqueantes |
| --- | ---: | ---: |
| Estado anterior comunicado (`e1993c32d`) | 76 | 1986 |
| Parejas con avance contado por barras pendientes | 77 | 1982 |
| Continuidad superior por líneas completas | 81 | 1641 |
| Continuidad inferior por líneas completas | 84 | 1542 |

La mejora acumulada desde 1986 es de **444 conflictos bloqueantes (22,4%) y ocho aprobaciones**.
Se conservan las 76 identidades y se agregan las columnas 72, 105, 110, 120, 126, 130, 131 y 135.
Son 81 columnas y tres vigas aprobadas: todavía no se sumaron vigas completamente aprobadas en
este edificio. Se mantienen 276 fallidos, 35 búsquedas iniciales agotadas y 13 provisionales.
Ningún aprobado participa en un conflicto bloqueante. Las condiciones agrupadas de empalme
superpuesto bajan de 95 a 77, y las de integridad de 41 a 31; separación, distancia entre parejas
y falta de pareja permanecen en 9, 4 y 2. Hay dos condiciones de generación pendientes.

La etapa superior realizó 44 detallados y 188 verificaciones nominales; la inferior, 63 y 223.
Ambas completaron el barrido de los patrones existentes y ejecutaron cero análisis estructurales
nuevos. No es una prueba de agotamiento del espacio de diseño: faltan familias de barras nuevas,
transiciones con desplazamiento construido, cambios de jaulas de columnas y cambios de sección.
Los tiempos de una ejecución local fueron 121,72 s y 174,92 s para esas etapas, respectivamente.
La integración completa consumió 395,71 s dentro del test; estos tiempos no son un SLA.
La repetición final con geometría guardada reprodujo exactamente 84 aprobados y 1542 conflictos:
365,09 s dentro del test, 368,10 s totales y 153,59 s en la etapa inferior.

La geometría retenida permite particionar los 1542 bloqueos sin duplicar pares:

| Par que entra en conflicto | Cantidad |
| --- | ---: |
| Dos barras registradas como pareja de empalme | 349 |
| Otras dos barras longitudinales | 701 |
| Barra longitudinal y pieza transversal | 398 |
| Dos piezas transversales | 94 |

Los 276 miembros aún fallidos son 197 vigas y 79 columnas; todos tienen condiciones de detallado
abiertas. Esta partición pertenece al estado final de 1542, no al diagnóstico anterior de 1992.


### Verificación y límites

- Siete casos pequeños con solver real: dos tramos con rotación/traslación, extremos invertidos
  y renumeración, y tres tramos con continuidad superior, extremos invertidos y continuidad
  inferior. Todos cierran sin condiciones abiertas ni conflictos bloqueantes. En tres luces
  iguales de 6 m se contrasta el momento con wL²/10 = 122,49 kN·m. Se comprueban barras compartidas
  en cada unión, estribos presentes y separados como máximo 125 mm, y regeneración estable.
- Regresiones de reemplazo atómico, presupuesto para toda la línea, comprobación de todos los
  certificados, continuidad ya fusionada, rechazo de cruces/solapes y avance dentro de un aviso
  agrupado. Las siete suites dirigidas suman 165 pruebas aprobadas.
- La integración del edificio conserva los aprobados por identidad y regenera exactamente los
  mismos veredictos y conflictos sin ejecutar la búsqueda. Fija además los 84 aprobados y los
  1542 conflictos como regresión de la secuencia completa.
- Typecheck sin errores nuevos: 442 existentes frente a una base de 443.

Reproducción desde `web/`, con WASM release:

```sh
npx vitest run --project unit src/lib/engine/detailing/__tests__/beam-continuity-integration.test.ts
STABILEO_CONTINUITY_EXPERIMENT=80 STABILEO_LINE_EXPERIMENT=1 npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
STABILEO_CONTINUITY_EXPERIMENT=64 STABILEO_BOTTOM_EXPERIMENT=1 npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
```

`STABILEO_CONTINUITY_AUDIT=/tmp/design-continuity-audit.json` guarda además miembros, geometría,
empalmes, conflictos y reverificación final. Los operadores continúan **opt-in**; su integración
al diseño habitual y la regeneración incremental siguen pendientes. El diseño completo aún no
verifica: 1542 bloqueos no son una solución final, y los patrones comunes no reemplazan el
trabajo necesario sobre transiciones y jaulas de los nudos.

## Actualización: diagnóstico después de las reparaciones de diámetros y filas

Ejecución del 22 de octubre sobre `93ed6fa70`, con instrumentación de diagnóstico local:
8 ensayos físicos de familias de diámetros y luego 8 de redistribución inferior. Se guardaron
los estados completos antes y después del segundo operador. Los números de las secciones
históricas siguientes corresponden al diseño anterior; los resultados para esta secuencia son
los de la tabla. El primer incremento de continuidad, documentado más abajo, bajó los bloqueantes
de 1992 a 1986 y conserva estos mismos estados de miembros:

| Estado final | Miembros |
| --- | ---: |
| Aprobados, incluidos 9 con advertencias | 76 |
| Fallidos con condiciones de detallado abiertas | 284 |
| Búsqueda inicial agotada, sin armado aceptado | 35 |
| Provisionales por verificación biaxial no cubierta | 13 |
| Total | 408 |

Los 76 aprobados son 73 columnas y 3 vigas. Los 284 fallidos son 87 columnas y 197 vigas:
280 pasan la reverificación resistente y 4 también fallan en ella. Por tanto, aumentar acero
de forma general no responde al bloqueo dominante. Los 35 agotados se reparten en congestión
(21), anclaje (8), ambos (3), anclaje/corte/congestión (2) y flexión (1). Esto describe el espacio
explorado, no demuestra imposibilidad de diseñar esas secciones.

### Geometría pendiente

Los **1992 conflictos bloqueantes** se particionan sin duplicar pares:

| Tipo de par | Conflictos |
| --- | ---: |
| Parejas registradas de empalme | 534 |
| Otras barras longitudinales | 765 |
| Longitudinal y pieza transversal | 599 |
| Dos piezas transversales | 94 |

La partición cruza `lapping.laps` por IDs de ambas barras y, para los demás pares, `bar.role`.
Se excluye `severity === 'marginal'`. No es un conteo de miembros: un miembro participa en muchos
conflictos y varias categorías. Persisten además 97 condiciones agrupadas de empalmes superpuestos,
42 de integridad, 9 de separación, 4 de distancia entre parejas y 2 de falta de pareja; estas
condiciones afectan respectivamente a 153, 68, 9, 4 y 2 miembros, con solapamientos.
Las 97 condiciones pueden representar varias parejas cada una; no equivalen a 97 pares físicos.

Casos confirmados en el estado final:

- **Vigas 178–179:** el empalme superior conserva 3 mm entre ejes, con 13 mm necesarios para
  que no se interpenetren. Prolongar las barras no construye el desplazamiento transversal.
- **Nudo 26, vigas 177–178:** cuatro empalmes superiores y cero barras continuas. El comprobador
  deja abierta la condición de integridad; no se resuelve cambiando sólo las filas inferiores.
  Es una condición conservadora no acreditada, no una prueba general de que todo empalme allí sea ilegal.
- **Columna 21:** separación libre de 14,4 mm frente a los 40 mm exigidos por el comprobador.
- **Columna 26:** pareja de empalme separada 184,2 mm frente al límite calculado de 150 mm.
- **Columna 27:** barras del tramo superior sin pareja inferior.
- **Vigas 177 y 189:** el generador sigue dejando abierta la condición de barra longitudinal
  en los dobleces del estribo (`generation`, referencia 25.7.1.2).

### Por qué la viga 227 mejora pero no verifica

La modificación conserva 11 barras inferiores Ø12 y pasa de **8+3 a 7+4**. Su reverificación
resistente sigue en `ok`, pero los conflictos físicos evolucionan así:

| Tipo | Antes | Después |
| --- | ---: | ---: |
| Longitudinal–transversal | 80 | 0 |
| Otras longitudinales | 16 | 20 |
| Parejas de empalme | 6 | 8 |
| Total bloqueante de la viga | 102 | 28 |

Quedan empalmes superiores con la viga 228: una pareja tiene **4,4 mm entre ejes frente a
18 mm necesarios**, y también separaciones insuficientes con barras inferiores de los tramos
vecinos. Aparecen seis choques de barras inferiores con barras de las columnas **46 y 47**,
con interpenetración de 16 mm. Ambas columnas ya estaban bloqueadas antes del cambio.

Esto expone una limitación del objetivo actual: conserva los miembros aprobados y reduce
conflictos globales, pero puede introducir nuevos pares conflictivos entre miembros que ya
fallaban. El descenso neto de 74 es real; no significa que cada restricción local mejore.
Tampoco los 80 choques eliminados representan 80 causas independientes: un mismo problema de
posición se repite a lo largo de los estribos. Conviene agrupar por causa geométrica y medir
qué falta para completar cada miembro/nudo, además del número bruto de pares.

### Límites de la búsqueda y siguiente intervención

El operador nuevo sólo redistribuye barras inferiores de una viga, con diámetro y número total
constantes. No cambia empalmes superiores, continuidad de línea ni transiciones de columnas.
La cola se ordena por número de conflictos y no incluye miembros que sólo tienen condiciones
de continuidad/empalme sin choques. Se detiene por presupuesto tras ocho ensayos; esto no es
una prueba de agotamiento de alternativas.

La propuesta para la viga 225 bajaba el total de 2066 a 1948, pero bloqueaba la columna 43,
previamente aprobada, y se rechazó correctamente. Reparar una viga por vez limita la búsqueda
cuando hace falta modificar conjuntamente el nudo y los vecinos. La búsqueda de posiciones
tampoco encontró una solución dentro de su dominio: reporta 62 nudos incompatibles y 80
eventos de vaciado de dominio sobre 43 miembros distintos, sin agotar su presupuesto de
cómputo. Su dominio es `beamLayoutsOnly`, con columnas y arreglos de nudo incompletos.

Los cuatro fallos resistentes restantes son las vigas 192 y 195 (utilización final 1,029),
y 262 y 265 (1,005). Sus registros incluyen una tolerancia desfavorable de altura útil de
15 mm. La reparación encuentra límites de anclaje en el primer par, y de acero máximo/anclaje
en el segundo; emite consejo de sección para este último. Los límites de reparación no deben
confundirse con la categoría exacta del chequeo que produjo cada utilización.

La siguiente intervención prioritaria es construir y comprobar conjuntamente las transiciones
de empalme y la continuidad superior de una línea, empezando por dos tramos reproducibles.
Después, reparar el conjunto viga–columnas de un nudo y sus cierres. Cada aceptación debe
conservar los aprobados y demostrar que completa restricciones, no sólo elimina muchas
repeticiones de un choque. Los 13 provisionales necesitan cobertura biaxial del verificador;
seguir probando jaulas no sustituye esa implementación.

### Reproducción y validación de esta actualización

Desde `web/`:

```sh
STABILEO_LAYER_SEARCH=8 STABILEO_LAYER_AUDIT=/tmp/design-layer-audit npx vitest run --project unit src/lib/store/__tests__/design-layer-search-experiment.test.ts
```

Guarda `.before.json` y `.after.json` con miembros, resultados, geometría, empalmes y conflictos.
La ejecución pasó **1/1 test**, incluido regenerar el estado aceptado sin volver a ejecutar la
búsqueda: 71,18 s de test y 74,19 s totales. Reprodujo los mismos IDs aprobados, ensayos y 1992
conflictos de las ejecuciones anteriores. La etapa de filas llevó 25,40 s. Es una ejecución
local satisfactoria posterior a los dos timeouts documentados, no una garantía de rendimiento.

## Primer incremento del plan: continuidad superior por parejas

Implementado el 22 de octubre, después de la auditoría anterior. El operador `harmonizeTop`
lee transiciones reales con condiciones de empalme/integridad pendientes y propone patrones
superiores comunes para ambos tramos y sus dos extremos. Reutiliza hasta cuatro patrones ya
presentes, dentro del catálogo y el espacio de ambas secciones. No modifica el armado inferior,
los estribos ni las terminaciones; excluye grupos superiores explícitos, continuidad editada,
miembros fijados, provisionales y vigas compuestas por varios elementos de análisis.

Cada propuesta se evalúa como un paquete: se actualizan los asientos de ambos vecinos, se
verifican los dos armados y se reconstruye el detalle completo antes de aceptar. También se
exige reverificación resistente favorable para ambos tramos y que disminuyan las condiciones
del nudo objetivo. Los ganchos pedidos pero todavía no provistos se rechazan: una advertencia
que pide construir un gancho no es una aprobación de la geometría actual. Se conservan las
protecciones globales y las aprobaciones por identidad de las búsquedas anteriores.

### Caso completamente resuelto

Fixture de dos luces de 6 m, sección 35×65 cm, H25, cargas de 12 kN/m permanentes y 8 kN/m
variables, más peso propio. Los apoyos declaran sus seis restricciones; el momento del apoyo
intermedio calculado por el solver coincide con el valor independiente wL²/8 = 153,1125 kN·m.
El armado inicial, 7Ø12 superiores en un tramo y 4Ø16 en el otro, pasa el chequeo nominal pero
deja cuatro interferencias y condiciones de empalme e integridad en el apoyo.

La búsqueda genera un patrón común y deja **ambos miembros con resistencia verificada, cero
conflictos bloqueantes y cero condiciones abiertas**. Se comprueba que existe el número correcto
de barras superiores compartidas, que los estribos siguen presentes con separación ≤125 mm,
y que regenerar los armados aceptados conserva el cierre. Pasa también al rotar/trasladar el
modelo, invertir sus extremos y renumerar los elementos; se compara el veredicto, no se exige
que dos alternativas igualmente válidas produzcan la misma selección.

El fixture expuso otro defecto: en apoyos sin ancho de columna, las dos jaulas automáticas
colocaban sus estribos extremos en el mismo plano. Ahora cada una reserva hacia su tramo el
espacio de su cierre: un diámetro transversal, que cubre medio diámetro de desfase del cierre
y el radio de la barra. Es una elección geométrica, no una nueva exigencia normativa. Se
mantienen las estaciones prescritas de líneas explícitas y el comportamiento en apoyos con
ancho de columna; las interferencias continúan midiéndose sobre las piezas reales.

### Resultado en el edificio de 408 miembros

Después de las búsquedas de diámetros y filas, con ocho ensayos completos adicionales:

| Medida | Antes | Después |
| --- | ---: | ---: |
| Aprobados finales | 76 | 76, mismas identidades |
| Conflictos bloqueantes | 1992 | 1986 |
| Condiciones agrupadas de empalme superpuesto | 97 | 95 |
| Condiciones de integridad | 42 | 41 |

Se aceptaron las propuestas de los pares 211–212 y 178–179; cambiaron los armados de 212 y 179.
Hubo diez propuestas, veinte llamadas al verificador, ocho detallados completos y cero nuevos
análisis estructurales. Se mantienen 35 búsquedas agotadas, 13 provisionales y el resto de condiciones;
no hay nuevas aprobaciones completas en este edificio. El operador no resuelve todavía las
transiciones que requieren cambios de posición, de columnas o de toda una línea.

Validación: **154 tests en siete archivos**, más la integración de 408 miembros, todos pasaron.
La integración incluye persistencia y regeneración sin volver a ejecutar la búsqueda, con
igualdad de estados, aprobados y conflictos. Su última ejecución llevó 101,80 s totales;
la etapa nueva, 30,26 s. El typecheck no agrega errores: 442 existentes frente a una base de 443.
Estos son tiempos de una ejecución local, no un compromiso de rendimiento.

Reproducción desde `web/`:

```sh
npx vitest run --project unit src/lib/engine/detailing/__tests__/beam-continuity-integration.test.ts
STABILEO_CONTINUITY_EXPERIMENT=8 npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
```

El operador está disponible en `physicalSearch.operators: ['harmonizeTop']`; sigue siendo opt-in.
Se puede combinar con los operadores previos, compartiendo presupuesto. La integración al
flujo automático general sigue siendo el paso 6 del plan; este incremento prueba una primera
familia de soluciones construibles y no declara terminado ese plan.

## Plan de implementación para cerrar diseños

Objetivo: encontrar armados íntegramente verificables para casos construibles dentro del
catálogo y las restricciones del proyecto, y distinguir los casos que requieren ampliar ese
dominio, cambiar sección o completar un verificador. No asumir que los 408 miembros actuales
admiten solución con sus secciones fijas. El objetivo final es resolver el modelo completo;
los 76 aprobados actuales constituyen un piso de regresión para las reparaciones de armado.

### 1. Casos con solución conocida y criterios de aceptación

Antes de cambiar el algoritmo, construir fixtures pequeños a partir de las causas medidas:
dos vigas con diámetros distintos (178–179), empalme superior 227–228, nudo 26 con continuidad,
transición de columnas con cambio de cantidad/posición, cierre con dos y tres filas, y un nudo
que necesite cambiar más de un miembro. Cada fixture tendrá una disposición válida de referencia,
además de la actual que falla. Si no se encuentra esa referencia con la sección fija, registrar
esa incertidumbre y no usar el fixture como prueba de factibilidad.

Verificar las referencias mediante cálculos y geometría independientes del generador: capacidad,
anclaje, continuidad, separaciones, radios y tolerancias aplicables. Incluir configuraciones
inválidas próximas al límite para detectar tanto falsos positivos como falsos negativos. Una
imagen plausible o una aprobación del mismo generador no basta como referencia.

Instrumentar una lista de restricciones con miembros, barras, nudo, magnitud y operaciones
aplicables. Agrupar las repeticiones de un mismo defecto sin perder las comprobaciones individuales.
Registrar el motivo exacto de cada rechazo; `regression` solo no alcanza. Separar explícitamente
`budget`, agotamiento del dominio explorado, verificador no disponible y solicitud de sección.

**Aceptación:** los fixtures válidos pasan el camino completo y los inválidos fallan por la causa
esperada. El resumen distingue las cuatro categorías anteriores y reproduce el estado de partida.

### 2. Alternativas con geometría construible

Extender `splice.ts`, `lap-materialize.ts`, `generate-beam.ts` y los generadores transversales.
La compatibilidad de un empalme debe devolver una construcción concreta: parejas de barras,
trayectorias, zona de solape y terminaciones. Materializar ese mismo plan sin volver a elegir
parejas o posiciones incompatibles. Una transición puede usar continuidad, empalme con posiciones
compatibles o desplazamiento admisible; cada opción necesita comprobaciones propias, incluidos
terceros y estribos. La bandera `contactLap` no autoriza una interpenetración.

Generar jaulas completas con alternativas de diámetro, cantidad, filas, asientos, cierres y trabas.
Comprobar temprano la sección, pero conservar varias familias geométricamente distintas: menor
área o menos filas no implican mejor comportamiento en el nudo. Reutilizar los verificadores finales
para evitar que el filtro inicial y la geometría construida apliquen reglas diferentes.

**Aceptación:** el generador encuentra soluciones para los fixtures de empalme y cierre, sin
conflictos ni condiciones abiertas; persistir y regenerar conserva la solución. Rotar, trasladar
o invertir los extremos del modelo conserva el veredicto físico. No alterar tolerancias para pasar.

### 3. Diseño de líneas de vigas y pilas de columnas

Usar `beam-line.ts` y `column-stacks.ts` para decidir el armado que debe ser compatible entre
tramos. En vigas, proponer continuidad de barras base y refuerzos locales, con zonas admisibles
de terminación/empalme según las demandas y reglas del proyecto. Incluir ambas caras e inversión
de momentos. En columnas, planificar correspondencias entre pisos, cambios de diámetro/cantidad
y espacio ocupado por las transiciones y el armado transversal.

Extender la programación dinámica y las tablas de compatibilidad existentes para elegir entre
los planes geométricos del paso 2. Mantener alternativas de línea para resolver después los cruces
con otras líneas y columnas. Una viga compuesta por varios elementos de análisis debe sustituirse
como unidad, conservando todas sus demandas y propietarios de barras.

**Aceptación:** el generador cierra los casos de continuidad superior, falta de pareja y transición
de columnas. Los conflictos entre parejas disminuyen junto con nuevas aprobaciones completas en
los casos objetivo. Comprobar propiedad de barras fusionadas, cantidades, dibujos y persistencia.

### 4. Reparación conjunta guiada por la causa

Extender `physical-design-search.ts`: la cola debe incluir todas las restricciones pendientes,
también continuidad o empalmes sin choque. Cada causa propone operaciones adecuadas y el conjunto
mínimo de decisiones conectadas: dos extremos, un nudo viga–columnas o un tramo de línea/pila.
Ampliar ese conjunto si las alternativas pequeñas no funcionan, con límites por operaciones.

Mantener varias alternativas de trabajo y el último diseño aceptado por separado. Los estados
intermedios pueden necesitar más de un cambio para ser viables; evaluar y aceptar el paquete
completo de forma atómica. Usar estados visitados y claves que incluyan a los vecinos para evitar
ciclos y rechazos cacheados fuera de contexto.

La aceptación conservará cobertura, comprobaciones aplicables y miembros aprobados por identidad.
Ordenar propuestas por miembros completamente aprobados y restricciones del conjunto resueltas;
después, defectos agrupados y sus magnitudes; por último acero, formas y costo. Mantener también
el control de regresión por clase de fallo. Registrar los nuevos conflictos entre miembros ya
fallidos, como los de 227 con 46/47, sin esconderlos detrás del descenso del contador global.
Un movimiento parcial podrá servir como estado de búsqueda; no se presentará como cierre del nudo.

**Aceptación:** resolver un fixture con solución conocida que requiere dos cambios conjuntos,
y reproducir la conservación de aprobados. En el caso 227, exigir eliminar todas sus condiciones
y no trasladar bloqueos a sus vecinos antes de declararlo resuelto. Las pruebas de búsqueda sobre
dominios pequeños se compararán con enumeración exhaustiva del mismo dominio.

### 5. Resolver los límites ajenos al detallado

Dos entregas separadas, que no deben bloquear las correcciones geométricas:

- **Cobertura biaxial:** implementar y contrastar las comprobaciones que faltan con referencias
  independientes y casos límite, sin convertir los 13 provisionales en aprobados por omisión.
  Integrar su resultado al dimensionado y a la reverificación final.
- **Alternativas de sección:** cuando el catálogo de armado no alcance, proponer dimensiones
  dentro de los límites del proyecto. Evaluar cada propuesta en un estado separado, recalcular
  análisis, peso, rigidez y demandas, y volver a diseñar/verificar el modelo afectado. El resultado
  publicable debe tener análisis y certificados de la misma geometría. Aplicar los cambios según
  las restricciones de edición del proyecto; conservar la versión anterior hasta completar el ciclo.

**Aceptación:** casos biaxiales independientes; un caso que cierre cambiando sección y otro que
alcance el presupuesto sin solución, con estado explícito y sin certificados anteriores reutilizados.
Un cambio de sección puede invalidar aprobaciones previas: sólo se acepta tras verificarlas de nuevo.

### 6. Eficiencia e integración al flujo habitual

Primero validar las reparaciones con reconstrucción completa. Después introducir filtros locales,
compatibilidades reutilizables y caché por geometría/materiales/demandas/vecinos/versiones. Invalidar
por dependencias reales, incluidos empalmes, barras compartidas y pisos vecinos. Comprobar equivalencia
entre evaluación incremental y completa y conservar una validación completa antes de publicar.

Medir en una colección de modelos pequeños, medianos y el de 408 miembros: aprobaciones por identidad,
restricciones pendientes, evaluaciones, regeneraciones, memoria y tiempos p50/p95 con condiciones
documentadas. Comparar base, búsqueda actual y nueva con igual presupuesto; el tiempo de máquina no
debe cambiar el significado de «dominio agotado». Mantener pruebas pequeñas en CI y el edificio completo
en una integración acotada, sin multiplicar ejecuciones pesadas innecesariamente.

Con los criterios satisfechos, integrar las nuevas semillas y reparaciones al diseño habitual:
no dejarlas exclusivamente en experimentos opt-in. Mostrar progreso, causa pendiente, presupuesto
consumido y próximo tipo de acción; permitir continuar desde el último estado consistente.

**Aceptación:** mismo resultado entre cálculo completo e incremental, presupuesto respetado,
regeneración estable y operación desde el flujo real. Un diseño sólo se declara completo si todos
sus miembros y comprobaciones aplicables están verificados y no quedan bloqueos físicos abiertos.

### Secuencia de entregas

1 → 2 → 3 → 4 es el camino principal. El paso 5 se divide en verificador biaxial y ciclo de secciones;
pueden desarrollarse como entregas independientes una vez fijados los contratos de diagnóstico.
El paso 6 optimiza e integra operadores ya validados. Cada paso puede dividirse en PRs pequeños;
ningún PR necesita esperar a que los 408 elementos estén resueltos, pero debe cerrar sus fixtures
objetivo y conservar las aprobaciones existentes. El primer objetivo demostrable es generar desde
cero dos tramos compatibles; el siguiente, cerrar su línea y luego el nudo completo.

La [investigación de procedimientos de dimensionado y heurísticas](design-sizing-heuristics.md)
añade referencias de ingeniería y cuatro experimentos de catálogo del 22 de octubre. Ninguna
restricción global de diámetros evaluada se adopta: aumentan las pérdidas de cobertura aunque
algunos contadores de aprobaciones y conflictos mejoren.

## Corrección de la medición

La revisión auditada mostraba 84 miembros `ok` o `warn`, pero 12 todavía participaban en
conflictos no marginales: 6, 10, 12, 14, 44, 72, 73, 87, 88, 92, 93 y 108.
`repairConflicts` omitía de `unresolved` los pares para los que no intentaba movimientos:
estribos/trabas y barras fijadas. La verificación del miembro leía las condiciones abiertas
producidas desde `unresolved`, por lo que esos conflictos detectados no siempre lo bloqueaban.

La corrección conserva los conflictos bloqueantes aunque no haya movimiento disponible.
No cambia ninguna barra ni tolerancia. El benchmark también cruza los aprobados contra
`assembly.conflicts`, de forma independiente de las condiciones abiertas.

| Medición del mismo modelo | Antes de mejorar las semillas | Con semillas mejoradas |
| --- | ---: | ---: |
| Aprobados que mostraba la aplicación | 80 | 84 |
| Aprobados sin conflictos físicos bloqueantes | 70 | 72 |
| Conflictos físicos bloqueantes | 2987 | 2981 |

La comparación de 80 a 84 sobreestimaba el progreso. Se conservan los 70 aprobados sin
conflictos anteriores y se agregan las columnas 32 y 34. Las columnas 12 y 14 mejoraron sus
empalmes, pero todavía tienen interferencias entre piezas transversales. La regresión comprueba
las identidades de los 72 y exige que ningún aprobado participe en un conflicto bloqueante.

Con el reporte corregido: 72 aprobados, 288 fallidos, 35 no disponibles por búsqueda agotada y
13 provisionales. Las condiciones `clash.unresolved` pasan de 1818 a 3323 porque ahora exponen
también los conflictos antes omitidos; no son interferencias nuevas. Este total incluye
conflictos marginales que el algoritmo ya había intentado reparar; los bloqueantes son 2981.

## Causas medidas

Los 276 fallidos originales tenían bloqueos de detallado: 197 vigas y 79 columnas. De ellos,
272 no figuraban entre los fallos de `run.reverification`. El ciclo de reparación selecciona
exclusivamente esa segunda lista (`design-feedback-loop.ts`, `failingRecords`), por lo que no
explora nuevos armados para la mayoría de los problemas geométricos. Tras corregir el reporte,
hay 284 de los 288 fallidos fuera de esa selección.

Los conflictos físicos bloqueantes se distribuyen en categorías excluyentes:

| Par que entra en conflicto | Cantidad |
| --- | ---: |
| Dos barras declaradas como pareja de empalme | 541 |
| Otras dos barras longitudinales | 935 |
| Barra longitudinal y pieza transversal | 1411 |
| Dos piezas transversales | 94 |
| Total | 2981 |

Las condiciones de empalme se cuentan por separado y pueden afectar a los mismos miembros:
97 empalmes superpuestos, 42 condiciones de integridad, 9 de separación, 4 de distancia entre
parejas y 2 de falta de pareja. No deben sumarse como miembros distintos.

Casos que permiten reproducir las causas:

- **Vigas 178 y 179:** barras superiores de un empalme separadas 3 mm entre ejes frente a los
  13 mm que requieren sus radios. El planificador acepta una transición de contacto;
  `lap-materialize.ts` extiende sus segmentos, pero no construye el desplazamiento transversal
  necesario. Declarar una pareja no elimina la interpenetración que detecta `classifyPair`.
- **Viga 207:** una barra de la segunda capa inferior intersecta el cierre de estribos;
  un par medido tiene 4,75 mm de interpenetración. El defecto se repite a lo largo de la viga.
  Regenerar la jaula con otro cierre o asiento es una operación distinta de desplazar una capa.
- **Columnas 12 y 14:** el cambio de armado resuelve su congestión longitudinal, pero permanece
  el choque entre la traba y el estribo. Es el ejemplo de por qué hace falta evaluar toda la jaula.
- **Integridad en el nudo 26:** el comprobador registra cuatro empalmes superiores en el apoyo
  y ninguna barra continua. Se necesita decidir continuidad y zona de empalme a escala de línea.
- **Columna 27:** barras que comienzan en el siguiente piso sin pareja inferior. La elección
  independiente por tramo no asegura una transición realizable entre cantidades y posiciones.

La búsqueda inicial agotada en 35 miembros tiene estas causas: congestión sola (21), anclaje
solo (8), ambos (3), anclaje/corte/congestión (2) y flexión (1). Agotar las alternativas actuales
no demuestra que no exista un armado adecuado. Los 13 provisionales tienen una comprobación
biaxial no implementada; ampliar la búsqueda no sustituye ese verificador.

## Qué hace la búsqueda actual y dónde se detiene

`coordination-search.ts` ya tiene propagación de restricciones, programación dinámica para
cadenas y búsqueda acotada para el resto. En la ejecución auditada produjo 1735 candidatos,
eliminó 981 por propagación, evaluó 3070 transiciones de programación dinámica y visitó un nodo
de búsqueda. No agotó el presupuesto. El resultado fue `PARTIAL_ENVELOPE_EXHAUSTED`, con
`beamLayoutsOnly`: 84 dominios se vaciaron y recibieron una alternativa de menor interferencia.
Hay 213 asignaciones, pero no constituyen una solución físicamente verificada.

El materializador produjo 964 empalmes y 647 fusiones, sin transiciones marcadas como
`unmaterialised`. Los 541 conflictos entre parejas de empalme muestran que haber producido
geometría no demuestra que esa geometría sea aceptable.

El ciclo posterior corrigió 33 fallos de reverificación y terminó en dos iteraciones. Quedaron
cuatro miembros aceptados con fallos resistentes al considerar la geometría final, más los 13
provisionales. Estos últimos aparecen como `FEEDBACK_LOOP_TRUNCATED` pese a que
`stats.truncated` es falso: se omiten al no tener `accepted` y reciben después una clasificación
por defecto. Esa clasificación debe distinguir falta de cobertura del verificador y presupuesto.

Otros límites del algoritmo, identificados en el código, no cuantificados como causa en este caso:

- Los hashes rechazados sobreviven entre geometrías; una alternativa rechazada en un entorno
  puede funcionar cuando cambian los vecinos. El rechazo debe depender del contexto que lo prueba.
- La monotonía del costo por miembro puede impedir una reparación más barata que además mejora
  el detalle. Para evitar ciclos bastan estados visitados y presupuestos; el costo no es una prueba.
- Una propuesta que empeora el detalle detiene el lote completo. Conviene probar alternativas
  por conjunto de miembros relacionados, conservando siempre una solución previa coherente.

## Costo de cálculo

Medición instrumentada de una ejecución local; tiempos inclusivos, sin valor de SLA ni conclusión
estadística sobre otras máquinas. Los tiempos de planta y búsqueda están contenidos en el detallado.

| Fase | Llamadas | Tiempo acumulado |
| --- | ---: | ---: |
| Diseño inicial | 1 | 3,99 s |
| Detallado completo | 2 | 6,70 s |
| Coordinación física por planta | 16 | 4,17 s |
| Búsqueda combinatoria de posiciones | 2 | 0,064 s |

La mejora de rendimiento más prometedora es evitar regeneraciones y verificaciones físicas
completas para candidatos incompatibles de antemano. Cambiar el solver combinatorio no ataca el
costo dominante observado. La reparación física sólo despejó 16 conflictos netos en la última
pasada completa; las propuestas restantes se rechazaron principalmente por invadir otras barras
(3863 intentos), salir de la sección (1602) o reducir la altura útil (357).

## Algoritmo propuesto

1. **Unificar el diagnóstico.** Producir restricciones incumplidas con miembros, barras, nudo,
   magnitud, regla, geometría y operación aplicable. La cola debe incluir resistencia, interferencias,
   continuidad, empalmes y jaulas. Separar verificaciones no implementadas y datos faltantes.
2. **Generar alternativas construibles.** Ofrecer pocas jaulas completas, diversas y verificadas
   localmente: posiciones, diámetros, capas, cierres, radios y trabas. Para columnas, considerar
   la transición con el piso vecino. Para vigas, mantener un armado continuo de referencia a lo
   largo de la línea y agregar refuerzos donde los requieren las demandas.
3. **Planificar transiciones con geometría testigo.** La compatibilidad debe devolver un plan que
   el materializador pueda ejecutar: parejas, desplazamientos, longitudes, zona de empalme y
   continuidad. Comprobar separación respecto de terceros y cierres; no sólo longitud y distancia
   máxima entre parejas. Rechazar el plan si su geometría no satisface los mismos verificadores finales.
4. **Conservar la propagación y la programación dinámica.** Resolver cadenas de tramos y líneas
   con tablas de compatibilidad entre candidatos completos. Mantener alternativas suficientes para
   los cruces; una decisión óptima de una línea no debe fijarse si tiene restricciones pendientes con otra.
5. **Reparar conjuntos de miembros relacionados.** Elegir un nudo conflictivo, sus vigas y los
   tramos de columna relevantes; reconsiderar conjuntamente sus elecciones. Expandir el conjunto si
   no mejora. Esto es una aplicación propuesta de búsqueda de vecindarios grandes o LNS: liberar una
   parte de la solución y reconstruirla, conservando el resto. Usar orden estable y límites por operaciones.
6. **Aceptar progreso sobre el resultado completo.** Conservar el mejor estado y sus certificados.
   Priorizar cobertura de verificaciones y número de miembros sin fallos; después, restricciones
   incumplidas y magnitudes, y por último acero y simplicidad. Ninguna reducción de acero compensa
   un fallo. Las exploraciones internas pueden pasar por alternativas peores sin publicarlas; una
   actualización visible debe mantener los miembros ya aprobados y superar la validación completa.
7. **Recalcular por dependencias.** Invalidar barras, empalmes, jaulas y vecinos alcanzados por el
   cambio, no sólo el miembro editado. Incluir propagación entre pisos y a lo largo de líneas. Memoizar
   por materiales, demandas, edición, candidato y geometría de sus vecinos. Una pasada completa
   final debe comprobar que el cálculo incremental coincide con el resultado independiente.

La LNS está descrita por [Pisinger y Røpke](https://backend.orbit.dtu.dk/ws/portalfiles/portal/5293785/Pisinger.pdf).
Aplicarla a estas jaulas es una propuesta de arquitectura, no un resultado demostrado para este modelo.
Un solver de restricciones como [CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
podría elegir candidatos discretos a partir de tablas de compatibilidad. Requiere representación entera;
los verificadores no lineales y geométricos seguirían siendo oráculos externos. No hay evidencia en esta
medición que justifique agregar esa dependencia antes de corregir candidatos y transiciones.

## Secuencia y criterios de aceptación

La corrección del reporte y la regresión independiente son el primer paso implementado. El siguiente
incremento debería atacar los empalmes entre diámetros distintos y la continuidad superior, por su alcance
de 135 miembros fallidos en los conflictos de parejas. En paralelo conceptual, los cierres de estribos
requieren un generador de jaulas que compruebe todas sus capas. Estos incrementos deben medirse por separado
para atribuir sus efectos; no se estima una cantidad de aprobados futura sin ejecutar los verificadores.

Antes de ampliar al modelo completo, reproducir cada causa en un nudo o dos tramos. Probar cambios de
diámetro, cantidad, capa, sección y orientación, y restricciones de usuario. Verificar que trasladar/rotar
una geometría o renombrar IDs no altera el veredicto físico. Comparar cálculos incrementales y completos,
invalidación de caché y determinismo con presupuestos iguales. En el conjunto de fixtures, conservar los
miembros aprobados, medir nuevas aprobaciones y bloqueos pendientes, llamadas a verificadores, regeneraciones,
memoria y tiempos p50/p95 tras separar inicialización WASM. No promover un caso aislado a garantía general.

## Reproducción

Desde `web/`, con el WASM de esta rama compilado:

```sh
STABILEO_DESIGN_AUDIT=/tmp/design-audit.json npx vitest run --project unit src/lib/store/__tests__/design-quality-audit.test.ts
npx vitest run --project unit src/lib/store/__tests__/design-quality-progress.test.ts
```

El primer comando guarda geometrías, conflictos, estados, decisiones de búsqueda y tiempos; es opt-in
y no impone umbrales de tiempo en CI. El segundo exige progreso físico real y que no haya aprobados con
conflictos bloqueantes.
