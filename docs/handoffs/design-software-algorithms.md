# Algoritmos de diseño: comparación y aplicación a Stabileo

Investigación del 22 de octubre de 2026. Código revisado: `1300fe431`, PR536.
Se consultaron manuales y documentación técnica de los fabricantes; no se ejecutaron
estos programas ni se accedió a sus implementaciones. Las versiones y módulos indicados
delimitan cada afirmación. La ausencia de un procedimiento en estas fuentes no demuestra
que el producto carezca de esa capacidad.

La recomendación es ampliar las **alternativas constructivas** del generador: jaulas
completas, continuidad y reparaciones conjuntas. La búsqueda existente ya permite probar
cambios y conservar mejoras verificadas, pero su primer operador físico sólo cambia la
familia de diámetros de una viga. Aumentar su presupuesto deja muchas soluciones fuera
de su alcance.

## Qué documenta cada programa

### Tekla Structural Designer: regiones, patrones y grupos

El autodesign de vigas selecciona barras por región de flexión y estribos por región de
corte. Después unifica el armado longitudinal para satisfacer la viga completa, por
separado en cada cara. Permite comenzar desde mínimos o desde las barras actuales. Para
columnas describe una iteración que maximiza separaciones y prueba una segunda capa
cuando hace falta. [Autodesign, 2025](https://support.tekla.com/doc/tekla-structural-designer/2025/chb_autodesignprocessconcretemembers).

Documenta tres patrones superiores y dos inferiores, con barras, prolongaciones y
empalmes definidos; contempla patrones especiales para luces cortas. Esto aporta una
representación de alternativas que incluye su desarrollo longitudinal.
[Patrones de vigas, 2026](https://support.tekla.com/doc/tekla-structural-designer/2026/chb_concretebeamdesignaspects).

En grupos, diseña un primer miembro, copia el armado, comprueba los demás y aumenta la
provisión si lo necesitan. Finalmente vuelve a verificar cada miembro. Los grupos de
detallado distinguen geometría conectada, apoyos y desplazamientos que no bastan para
definir un grupo de diseño. [Diseño por grupos, 2026](https://support.tekla.com/doc/tekla-structural-designer/2026/chb_concretedesignanddetailinggroups).

**Aplicación propuesta:** generar patrones de línea y reutilizar soluciones como semillas;
verificar cada destino con sus demandas y su nudo. Estas fuentes no demuestran una búsqueda
global de todas las jaulas posibles ni una resolución general de interferencias 3D.

### CYPECAD / CYPE 3D: disposiciones conjuntas de armado

El editor permite importar una disposición admisible de la tabla de armado de montaje.
Una fila determina longitudinales y un conjunto de estribos y ramas; también permite
especificar disposiciones por intervalo. Los cambios se vuelven a comprobar mediante
la actualización de errores y las listas de verificaciones.
[Disposiciones y edición del armado transversal](https://info.cype.com/en/subject/cypecad-and-cype-3d-editing-transverse-reinforcement-in-beams/).

**Aplicación propuesta:** tratar longitudinales, estribos, ramas y cierres como una jaula
paramétrica. La documentación consultada muestra tablas y edición, pero no publica el
orden interno de exploración ni una función de costo del optimizador. Tampoco habilita
a importar sus disposiciones sin comprobar la norma y el sistema lateral del proyecto.

### spBeam v10: cantidad, diámetro, separación y capas

Parte del área requerida y el diámetro mínimo para obtener una cantidad inicial. Comprueba
separaciones y aumenta el diámetro cuando no cabe; también ajusta cantidades por separación
máxima. Contempla capas, espacio ocupado por dobleces de estribos y tolerancias configurables.
[Manual, §2.5](https://www.structurepoint.org/spbeam-online-manual/spBeam-v10-Manual-Book/2.5.Detailing-Provisions/2.5.Detailing-Provisions.htm).

**Aplicación propuesta:** usar área requerida para orientar y comprobar capacidad geométrica
temprano, con los mismos parámetros que el verificador final. Un área aproximada no debería
eliminar alternativas sin una cota que justifique el descarte. Las reglas ACI/CSA del manual
no reemplazan las del adaptador CIRSOC del proyecto.

### Dlubal RFEM 6: refuerzo base, residual y prioridades

Para superficies, permite automatizar diámetro o separación, con límites y listas admitidas.
Intenta cubrir el área faltante con refuerzos de prioridad 1; si no alcanza, introduce el
máximo permitido, recalcula el residual y continúa con prioridad 2. Repite hasta cubrirlo
o agotar prioridades. Explica que agregar capas puede reducir el brazo interno y aumentar
el área requerida, por lo que se recalcula.
[Proceso automático de armado de superficies, 2023](https://www.dlubal.com/en/support-and-learning/support/knowledge-base/001842).

**Aplicación propuesta:** modificar primero el refuerzo local que corresponde al déficit y
recalcular con la posición real de las barras. Este algoritmo documentado corresponde a
superficies; usar su estrategia en vigas sería una adaptación nuestra.

### Autodesk Robot 2026: búsqueda discreta de secciones

La optimización de vigas permite variar ancho, altura o ambos con relación fija; usa pasos
discretos y límites. Los objetivos incluyen cuantía y peso de acero por volumen de hormigón;
la evaluación se basa en el armado provisto. Advierte que distintas secciones iniciales
pueden producir distintas soluciones y que pasos pequeños aumentan el tiempo de cálculo.
[Optimización geométrica](https://help.autodesk.com/cloudhelp/2026/ENU/RSAPRO-UsersGuide/files/GUID-270A1DF2-3695-455E-B49F-41DFBE33D6EC.htm).

**Aplicación propuesta:** un ciclo exterior de secciones admisibles, con varias semillas y
presupuesto explícito. Su utilidad se evaluaría después de mejorar el armado con sección
fija. La fuente no demuestra optimalidad global ni detalla aquí la invalidación del análisis.

### RAM Concrete: preferencias y reutilización comprobada

El tutorial histórico de Bentley configura tamaños disponibles, mezclas de diámetros,
cantidades mínimas e incrementos de separación y longitud. Permite copiar armados entre
líneas compatibles y vuelve a comprobar el destino. Es evidencia del procedimiento de
ese tutorial, que usa ACI 318-02, no un inventario de capacidades de la versión actual.
[Tutorial de vigas](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0117785).

Las notas de RAM 2025 registran una corrección relevante: la optimización AS 3600 no
consideraba todos los diámetros disponibles y podía fallar aunque otro tamaño verificase;
el armado asignado manualmente sí se evaluaba correctamente.
[Correcciones de RAM 2025](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0045621).

**Aplicación propuesta:** medir si la búsqueda encuentra soluciones conocidas, además de
comprobar que el verificador rechaza soluciones malas. Agotar una heurística no prueba
inviabilidad.

### ETABS: separar demanda de armado y cerrar análisis–diseño

El diseño interactivo documenta áreas requeridas por estación y combinación para vigas;
en columnas distingue dimensionar área y comprobar barras especificadas mediante interacción
P–M–M. Esa salida, por sí sola, no es una jaula materializada.
[Diseño interactivo](https://docs.csiamerica.com/help-files/etabs/Menus/Design/Concrete_Frame_Design/CF_Interactive_Concrete_Frame_Design.htm).

Su procedimiento exige repetir análisis y diseño después de cambiar secciones y comprobar
que las secciones finales coincidan con las usadas en el análisis.
[Procedimiento de diseño](https://docs.csiamerica.com/help-files/etabs/Getting_Started/Concrete_Frame_Design_Procedure.htm).

**Aplicación propuesta:** conservar estados diferentes para demanda, propuesta nominal y
detalle verificado; invalidar resultados dependientes cuando cambien secciones. No se
infiere de estas páginas el alcance de otros módulos de detallado de CSI.

## Contraste con nuestro código

Ya existen piezas que conviene extender:

- `candidate-enumerate-beam.ts` ofrece opciones regionales, pero conserva sólo las primeras
  40, ordenadas por filas, área y diámetro. Avanza los parámetros asociados al fallo; no
  recorre todas sus combinaciones. Ese recorte puede perder diversidad útil para el nudo.
- `candidate-search.ts` termina al alcanzar el objetivo de utilización nominal. Eso sirve
  para obtener una propuesta resistente, pero no establece que sea la mejor alternativa
  física. Conviene conservar varias propuestas distintas para la etapa siguiente.
- `beam-line.ts`, `repeated-frames.ts` y `column-stacks.ts` ya representan líneas, repetición
  y pilas. La nueva búsqueda debería aprovecharlos. Sus agrupaciones no constituyen por
  sí mismas una prueba de equivalencia de apoyos, demandas o geometría de detalle.
- `physical-design-search.ts` prueba una familia de diámetros por vez, con reconstrucción
  completa y protección de resultados existentes. No repara conjuntamente varios miembros
  y excluye los tramos que requieren reemplazar varias piezas de análisis.
- La [auditoría física](design-verification-audit.md) identifica cierres que interfieren
  y empalmes cuyo desplazamiento transversal no se materializa. Ninguna estrategia de
  búsqueda puede seleccionar una geometría que el materializador todavía no sabe construir.

## Algoritmo propuesto

Esta sección es una propuesta propia apoyada en la comparación, no una descripción del
algoritmo interno de un fabricante. Tampoco está implementada por este documento.

1. **Generar jaulas completas y diversas.** Definir plantillas paramétricas con asientos de
   barras, filas, estribos, ramas, cierres y transiciones. Probar primero la jaula actual y
   sus reparaciones pequeñas. Reservar alternativas de pocas barras grandes, más barras
   pequeñas y distinta distribución de filas; recortar dentro de cada familia después
   de comprobaciones geométricas económicas. Mantener el resto del catálogo para ampliar
   la búsqueda si las primeras fallan. No descartar por dominancia en área solamente:
   un cambio de diámetro puede mejorar separación y empeorar anclaje.
2. **Resolver continuidad antes de detallar cada pieza aislada.** Para una línea compatible,
   proponer barras base y refuerzos locales; resolver longitudes y transiciones. Para una
   pila, proponer correspondencias entre barras de pisos sucesivos. Usar las representaciones
   existentes y verificar restricciones de empalme, inversión de momentos y sistema lateral.
3. **Elegir la reparación por causa.** Un cierre contra una barra interior propone otro
   cierre o asiento; un empalme incompatible propone transición o cambio conjunto de sus
   dos extremos; un anclaje insuficiente propone otras barras o terminación admisible.
   Cada operación declara qué decisiones y miembros cambia, y qué verificaciones invalida.
4. **Explorar paquetes de cambios.** Conservar una pequeña colección de alternativas
   distintas por nudo o línea. Un cambio de dos miembros se evalúa como una transacción:
   puede resolver un problema que ninguno resuelve por separado. Mantener estados de
   trabajo separados del último diseño aceptado; no publicar sus pasos incompletos.
5. **Aceptar con prioridades explícitas.** Exigir cobertura, comprobaciones aplicables y
   preservación de aprobados por identidad. Entre propuestas que superan esas protecciones,
   priorizar más miembros completamente verificados; luego menos miembros bloqueados y
   condiciones pendientes; finalmente costo y simplicidad. Contar empalmes, formas y familias,
   además de acero. La suma de choques sólo debe orientar: partir una barra puede alterar
   el conteo sin mejorar la constructibilidad.
6. **Escalar cuando corresponda.** Si las alternativas de armado se agotan, explorar un
   conjunto discreto de secciones autorizado por las restricciones del proyecto. Reanalizar
   peso, rigidez y demandas, y volver a verificar todas las dependencias afectadas. Agotar
   el presupuesto informa lo pendiente y conserva el último estado aceptado.

Para eficiencia: reutilizar propuestas de grupos compatibles, cachear sólo por contexto
completo y versión de verificadores, y evaluar primero la dependencia afectada. Antes de
sustituir las reconstrucciones globales actuales, exigir equivalencia entre verificación
incremental y completa; conservar una pasada completa antes de aceptar el resultado final.
Los rechazos cacheados deben invalidarse cuando cambien los vecinos relevantes.

## Orden de implementación y evidencia exigida

| Incremento | Problema que resuelve | Experimento decisivo |
| --- | --- | --- |
| 1. Plantillas de cierre y asientos; materialización de transiciones | Alternativas físicas ausentes aunque el área alcance | Casos mínimos de cierre, dos filas y empalmes de distinto diámetro; geometría sin interferencias y verificación normativa completa |
| 2. Alternativas nominales diversas y reparación desde el armado actual | Una propuesta resistente puede ser mala para el nudo | Casos pequeños con catálogo enumerable: comparar soluciones encontradas con enumeración exhaustiva del mismo dominio |
| 3. Cambio conjunto de nudo/línea y continuidad | Reparaciones que requieren coordinar vecinos | Caso con solución conocida que ninguna modificación aislada resuelve; comprobar ambos miembros y vecinos |
| 4. Reutilización e invalidación incremental | Costo de reconstruir todo para cada intento | Igualdad de veredictos y geometrías relevantes frente al camino completo; medir costo en varios tamaños |
| 5. Alternativas de sección con reanálisis | Sección insuficiente o congestionada | Caso que sólo cierre cambiando sección; detectar demandas o certificados desactualizados |

Para cada incremento comparar base, búsqueda física actual y variante nueva con el mismo
presupuesto. Medir aprobados por identidad, cobertura por tipo, clases de fallo, acero,
empalmes, evaluaciones nominales, detallados y tiempo. Incluir vigas cortas, apoyos angostos,
inversión de momentos, columnas entre pisos y nudos congestionados; un solo edificio no
permite afirmar robustez general. La enumeración exhaustiva valida cobertura de la búsqueda
dentro de su dominio finito; la corrección del verificador necesita referencias independientes.

La medición ya existente en `rc-design-frame` es **72 → 76 aprobados finales**, sin perder
los 72 anteriores, y **2981 → 2066 conflictos bloqueantes**, con ocho alternativas detalladas.
Es el resultado del operador actual, no de las propuestas de este informe. Su reproducción
y limitaciones están en [dimensionado y heurísticas](design-sizing-heuristics.md). El próximo
objetivo es cerrar clases de fallo hoy inaccesibles, conservando esa evidencia de no regresión.
