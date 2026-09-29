# 5. Modo PRO

El modo PRO es el de **elementos finitos y modelos complejos**. Además de barras en el espacio,
modela **placas y cáscaras** (losas, tabiques, muros, plateas), vínculos entre nodos, cargas
generadas según norma, y corre análisis dinámicos y no lineales.

Este capítulo cubre el modelado y el análisis: las pestañas **Modelo** y **Análisis**, la
importación de modelos y el reporte.

![Un modelo en PRO: pórtico de hormigón con una losa y un tabique modelados como placas](img/pro-model.webp)

## Cómo entrar y cómo empezar un modelo

Se entra con el botón **PRO** del encabezado. PRO guarda **su propio modelo**, separado del de
Básico: al cambiar de modo, cada uno conserva el suyo.

Para empezar:

- **Un modelo vacío:** el **+** de las pestañas.
- **Un ejemplo:** **Proyecto → Modelo nuevo → Ejemplos**. Hay dieciséis, agrupados en edificios,
  industriales, energía y offshore, fundaciones, estructuras de gran luz y modelos grandes de
  demostración.
- **Importar** (ver [más abajo](#importar-modelos)): una planilla de Excel o un plano de AutoCAD
  (DXF).

**Proyecto** tiene también, como en Básico, **Guardar**, **Abrir**, **Compartir link** y
**Exportar** (los resultados en Excel o CSV, el reporte, y la vista en DXF o SVG). Ver el
[capítulo 1](01-primeros-pasos.md#guardar-abrir-y-compartir).

## La pestaña Modelo

En PRO, cada botón de la cinta abre un **panel con una tabla**. Para dibujar en el visor, cada
panel tiene su botón **Dibujar** (nodo, barra, placa…); al tocarlo de nuevo se vuelve a
seleccionar. La herramienta de **selección** está en la barra superior, junto a deshacer y
rehacer.

### Dibujar

**Nodos.** Una tabla editable de coordenadas X, Y, Z en metros. Se puede **pegar desde Excel**
(columnas X, Y y opcionalmente Z).

**Barras.** Una tabla con nodo inicial y final, material y sección, y las columnas **Vinc. i** y
**Vinc. j** con un botón que alterna entre **Art** (articulado) y **Emp** (empotrado) en cada
extremo. Esas columnas liberan sólo el momento **Mz**; para liberar cualquier otro grado de
libertad se edita la barra (ver abajo). Además:

- **Curva:** un arco que pasa por tres nodos, materializado como una cadena de barras rectas. El
  panel informa el error de cuerda.
- **Excentricidad de barra (offset):** desplaza el eje de la barra respecto de sus nodos, por
  ejemplo para que una viga cuelgue de la losa.
- Con clic derecho sobre una barra: **editarla** (material, sección y articulaciones por grado de
  libertad en cada extremo) o **dividirla** en N partes (de 2 a 20). Con nodos seleccionados, clic
  derecho en un espacio vacío los refleja en X o en Y o los gira 90°.

Las barras que se dibujan son de pórtico. Las de reticulado se incorporan desde los generadores o
desde una planilla de Excel, que también permite fijar el giro de los ejes locales de cada barra.

**Placas.** Una placa se define por sus nodos: **tres nodos forman un triángulo y cuatro un
cuadrilátero**. Se le asigna material y espesor.

- **Generador de malla:** a partir de cuatro esquinas (en sentido antihorario), genera una malla
  de cuadriláteros por tamaño objetivo o por cantidad de divisiones. Puede partir las vigas del
  contorno para que compartan los nodos del borde.
- **Cáscara (con curvatura):** para cuadriláteros cuyos cuatro nodos no están en un mismo plano.
  El panel mide cuánto se aparta el cuarto nodo y sugiere cuándo usarla.
- **Escalera:** una losa inclinada con los escalones aplicados como carga.
- **Offset de losa/muro (excéntrico):** desplaza el plano medio de la placa, por ejemplo para
  alinear la cara superior de la losa con el nivel de piso.

> **Cómo se conectan las placas con las barras:** sólo a través de **nodos compartidos**. Una
> viga que pasa por debajo de una losa sin compartir nodos con ella no está conectada. El panel
> avisa cuando una placa tiene una esquina suelta.

**Grilla y niveles.** Los ejes del edificio se cargan como vanos a partir de un origen ("6; 7,5; 6"
o "3x6"), con nombres A, B, C… en un sentido y 1, 2, 3… en el otro, y los niveles como alturas de
piso desde una cota base. Se guardan con el proyecto y viajan en el código de modelo. El **nivel
activo** es el plano donde caen los nodos nuevos y donde se dibujan los ejes con sus nombres; el
cursor se engancha a las intersecciones y a los ejes. También se puede **leer la grilla del
modelo** (un nivel en cada cota con nodos y un eje en cada coordenada con columnas) y crear
**columnas y vigas entre ejes** en un rango de ejes y niveles, en un solo paso de deshacer.

**Transformar.** Repetir, repetir en polar, espejar, girar y mover la selección, como copias o en
el lugar. Las copias que caen sobre un nodo existente se sueldan a él, que es lo que conecta los
vanos repetidos, y copian cargas, apoyos y grupos si se pide. Mientras se cambian los números, el
resultado se ve en el modelo antes de aplicarlo. El punto, el plano de espejo y el giro se pueden
tomar con clics: un punto, dos puntos del plano de espejo, o centro, desde y hasta para el giro.
**Mover por dos puntos** toma un punto base y el destino; con Ctrl (⌘ en Mac) en el segundo clic
copia en vez de mover.

**Colocar.** Todo lo que se inserta en el modelo (pegar, una estructura generada, una plantilla,
una copia de un grupo, un IFC o un DXF) sigue al cursor como un **fantasma** antes de entrar:

- el cursor se engancha a un nodo, o al plano del nivel activo con la grilla;
- **Tab** cambia el punto de inserción, **R** gira 90° (Shift+R al revés) y **F** espeja;
- en la barra de colocación se escriben las coordenadas y **Enter** coloca ahí; **Esc** cancela;
- **Shift+clic** coloca y deja seguir colocando copias;
- la barra dice cuántos nodos se van a soldar al modelo; en esos nodos queda el apoyo del modelo.

Mientras se coloca, el modelo sólo se mira. Cada colocación es un paso de deshacer, lo colocado
queda seleccionado y deshacer devuelve la selección anterior.

**Copiar y pegar.** Ctrl+C, Ctrl+X y Ctrl+V (⌘ en Mac) copian, cortan y pegan la selección con
sus apoyos, cargas y grupos, y con sus secciones y materiales por definición. Ctrl+V pega con el
fantasma; Ctrl+Shift+V pega en el mismo lugar. Lo copiado va al portapapeles como código de
modelo, así que se puede pegar en otro proyecto o en otra pestaña. En campos de texto las teclas
hacen lo de siempre.

**Editar.** Al dividir barras en N partes, los puntos de corte se ven en las barras
seleccionadas antes de dividir.

### Propiedades

**Materiales** y **Secciones** funcionan como en Básico: una biblioteca (aceros, hormigones,
maderas, aluminio; perfiles laminados y conformados) o definiciones a medida. En secciones,
**Construir sección** arma formas paramétricas, y en los perfiles de catálogo se puede elegir la
rotación y componer secciones.

### Condiciones

**Apoyos.** **Empotrado 3D**, **Articulado 3D**, móviles en cada plano (**Roller XZ**, **XY** y
**YZ**), **Resorte 3D** (con rigidez en cada grado de libertad) y **Personalizado**, donde se marca
uno por uno qué desplazamientos y giros se restringen. Un móvil se desplaza libremente dentro de
su plano: **Roller XZ**, por ejemplo, sólo está restringido en la dirección Y.

**Vínculos.** Relaciones entre nodos:

- **Vínculo rígido:** un nodo esclavo sigue a un nodo maestro como si estuvieran unidos por una
  barra infinitamente rígida.
- **Diafragma:** los nodos de un plano se mueven juntos en ese plano. Es la hipótesis habitual
  de losa rígida en su plano. **Auto-detectar diafragmas** agrupa los nodos por nivel (con una
  tolerancia de 5 cm) y toma como maestro el nodo más cercano al centro.
- **DOF iguales:** dos nodos comparten uno o más grados de libertad (DOF).
- **Conexión excéntrica**, **MPC lineal** (restricción multipunto: una relación lineal entre
  grados de libertad de varios nodos) y **conectores** con rigidez propia entre dos nodos.

**Cargas.** El panel tiene tres partes:

- **Casos de carga:** cada caso con su tipo (D permanente, L sobrecarga de uso, Lr sobrecarga de
  cubierta, W viento, E sismo, S nieve) y un botón para mostrarlo u ocultarlo en el visor. El
  **peso propio** está **activado por defecto** en PRO y se calcula para barras y placas.
- **Combinaciones:** manuales, o generadas automáticamente. Las últimas son las de CIRSOC
  101-2025 (§2.3.2), con el viento a 1,0 W o 0,5 W. Las de servicio son una alternativa que se
  genera aparte: las gravitatorias a factor 1,0 y, con viento, las de CIRSOC 102-2025 B.4.2
  (0,6 D + 0,6 W y D + 0,75 L + 0,45 W + 0,75 (Lr ó S ó R)). Al generarlas se puede pedir el viento y el sismo en los dos sentidos: cada caso
  entra también con el signo opuesto. En **Reglas del proyecto** se escriben combinaciones propias
  en acciones (por ejemplo 1,2 D + 1,0 E + 0,5 L), para resistencia o servicio; se guardan con el
  proyecto, pueden partir de las de CIRSOC 101 y se guardan como plantilla para otro proyecto.
  Los ejemplos de PRO se cargan con las combinaciones últimas de CIRSOC 101-2025 armadas desde
  sus casos (salvo la plataforma offshore, cuyo oleaje no es un sismo de CIRSOC 103).
- **Piso:** una carga por unidad de superficie sobre un nivel, un grupo de planta o las vigas
  seleccionadas se reparte a las vigas por área tributaria. Los paños son las regiones cerradas
  que forman las vigas en planta; en dos direcciones cada punto carga la viga más cercana (en un
  paño rectangular son los triángulos y trapecios a 45°) y en una dirección las fajas cargan las
  dos vigas a las que llegan. Cada viga recibe cargas lineales parciales cuya suma es la carga
  por el área. Una planta muestra los paños antes de aplicar; los paños no convexos se informan
  y no se cargan.
- **Agregar carga:** nodal (en ejes globales), distribuida y puntual sobre barras (en ejes
  locales de la barra), y **de superficie** sobre placas cuadriláteras: en kN/m², vertical (un
  valor positivo actúa hacia abajo) y repartida entre los cuatro nodos de la placa.

**Auto-generar desde norma.** Arma el plan de cargas del edificio a partir de la normativa
argentina:

- **Cargas permanentes** a partir de las capas de la construcción (CIRSOC 101, Tabla 3.1).
- **Sobrecarga de uso** según el destino de cada local, con la reducción por área tributaria.
- **Viento** según CIRSOC 102-2025, con los cuatro casos de carga de la Figura 2.4-8: el caso 1
  en cada dirección, el caso 2 con el momento torsor de la excentricidad ±0,15 B, y los casos 3 y
  4 en las dos direcciones a la vez. Se puede pedir sólo el caso 1, o los casos 1 y 3 para los
  edificios exceptuados (art. 2.4.7). El viento en −X y −Y se genera como casos propios. La presión
  de cubierta se aplica sobre las barras del techo, normal a cada una. El cerramiento se puede
  clasificar a partir de las aberturas, y el diálogo muestra q_z según la altura.
  El diálogo muestra las dos ediciones de CIRSOC 102: la de 2025 se aplica; la de 2005 aparece
  pero no se puede elegir hasta que se suministre su texto, y no se reemplaza por la de 2025.
  Para las combinaciones de servicio se puede agregar el **viento de servicio Wa** de B.4.2: la
  velocidad de 50 años del mapa de la Figura C AB.4.2-1 y una recurrencia (5 a 500 años), que la
  convierte con el factor de esa figura.
- **Nieve** según CIRSOC 104-2005: pg de la localidad (Tablas 1.1 a 1.15) o del lugar, pf con
  sus mínimos para cubiertas de baja pendiente, Cs según la pendiente y la condición térmica,
  lluvia sobre nieve, y la carga no balanceada en cubiertas a dos aguas, un caso por cada sentido
  del viento. Las acumulaciones por arrastre, las cargas parciales y el hielo no se generan.
- **Sismo** según INPRES-CIRSOC 103 (método estático). Esta parte se habilita cuando el proyecto
  tiene asignado un reglamento sísmico; si no lo tiene, el diálogo lo indica.

Las cargas de superficie se transforman en cargas lineales sobre las barras horizontales,
multiplicándolas por el ancho tributario que se indica en el diálogo, el mismo para todas; el
viento se aplica como fuerzas por nivel, y la torsión como fuerzas repartidas entre los nodos del
nivel que suman ese momento. Primero muestra el plan de cargas para revisarlo, y lo
aplica cuando lo confirmás. Los casos de tipo D, L, W y E tienen además un botón **§** que abre el
diálogo directamente para ese caso.

### Generadores

**Estructuras metálicas** genera la **geometría** de estructuras típicas:

- **Cercha:** trapezoidal, de cordones paralelos, Pratt, en arco o pórtico de alma llena, con
  distintos patrones de diagonales, media cercha y diagonales subdivididas.
- **Columna reticulada.**
- **Nave:** luz, separación entre pórticos, cantidad de pórticos, columnas reticuladas o de alma
  llena, correas y arriostramientos de cubierta, de cercha y de muro.
- **Estructuras:** pórtico espacial por vanos (X, Y y pisos), pórtico plano, emparrillado, viga
  continua, reticulado espacial, viga reticulada en X o en K, cabriada Howe, diente de sierra,
  bóveda cilíndrica, viga circular y cúpula. Los vanos se escriben como "6; 7,5; 6".

Asigna un perfil a cada tipo de barra, un acero y los apoyos (los del generador, ninguno,
articulados o empotrados). La estructura puede ir:

- como **modelo nuevo**, que reemplaza al actual (se deshace con un solo paso);
- **en un punto:** coordenadas, giro, plano XZ o YZ, o sobre un eje de la grilla, y el punto de
  inserción elegido en un esquema; el fantasma se ve en el modelo mientras se cambian los datos;
- **en un nodo**, con el mouse.

Insertada en un modelo, queda como un **grupo generado**: con **Editar parámetros** se cambian
sus datos y **Regenerar en el lugar** la rehace en un paso. Las barras que siguen existiendo
conservan su número, sus cargas y la sección que se les haya cambiado a mano.

**Plantillas:** una parte del modelo se guarda con un nombre y se vuelve a colocar con el
fantasma; se comparte copiando su código.

## Importar modelos

Desde **Proyecto**:

- **Planilla de Excel.** La misma planilla que en Básico: **Plantilla ↓** descarga las hojas, sus
  columnas y ejemplos. En PRO se usan además las hojas de placas triangulares (**Plates**),
  cuadriláteras (**Quads**) y vínculos (**Constraints**). Es la forma más cómoda de cargar un modelo
  grande armado en otra herramienta.
- **Plano DXF (AutoCAD).** Un asistente de cuatro pasos:
  1. el archivo y sus unidades;
  2. qué representa cada capa del dibujo: ejes, columnas, vigas, tabiques, losas, huecos, textos;
  3. los supuestos: cantidad de pisos y alturas, dimensiones de columnas, vigas, losas y
     tabiques, tipo de apoyo en la base, cargas y mallado de losas;
  4. una vista previa antes de aplicar.

  El resultado es un **borrador** de la estructura, marcado como no revisado, con la lista de
  supuestos que se usaron. Las losas y los tabiques se generan como placas. Si ya hay un modelo,
  el borrador se puede **insertar** en él con el fantasma en vez de reemplazarlo.
- **IFC.** Barras de un modelo BIM con sus secciones y materiales. Con un modelo abierto se puede
  **insertar** con el fantasma o **reemplazar** el modelo; las dos cosas se deshacen en un paso.

## Antes de calcular: diagnósticos

PRO revisa el modelo mientras lo armás. Si hay errores, aparece un aviso que abre el panel
**Diagnósticos**, y el panel se abre solo si tocás **Calcular** con errores. Separa:

- **Errores**, que impiden calcular: menos de dos nodos, ni barras ni placas, ningún apoyo, barras
  sin sección o sin material, secciones con área o inercia nula, cargas que apuntan a elementos
  inexistentes.
- **Advertencias:** nodos coincidentes o sueltos, barras muy cortas o duplicadas, barras
  articuladas en los dos extremos, cargas transversales sobre barras de reticulado.
- **Información:** casos de carga vacíos, modelo sin cargas.

Después de resolver, el motor informa además la **calidad de la malla** de placas (relación de
aspecto, alabeo, ángulos muy chicos).

## La pestaña Análisis

![Resultados en PRO: tensiones de Von Mises en la losa y el tabique](img/pro-results-shells.webp)

### Calcular

**Calcular** resuelve el modelo con el motor 3D. Si hay combinaciones, resuelve todos los casos y
combinaciones y arma la envolvente. Para modelos grandes usa un solver disperso (factorización
de Cholesky con reordenamiento), que es lo que permite resolver miles de grados de libertad en el
navegador.

### Resultados

Los diagramas son los mismos que en Básico 3D: **Deformada**, **N**, **My**, **Vz**, **Mz**,
**Vy**, **T** y **Tensiones**, que en PRO pinta tanto las barras como las placas.

En el panel de **Resultados**:

- **Mostrado como:** diagrama, color de barras o mapa de colores. Para **Tensiones**, **Mostrar
  en** barras, placas o ambas.
- **Mapa de colores** de momento, corte, esfuerzo axil, **Resistencia (σ/fy)**, Von Mises o
  **Contorno losas/muros**.
- Para las placas, la componente a ver: Von Mises, tensiones principales σ1 y σ2, σxx, σyy, τxy
  (kN/m²) y momentos por unidad de ancho mx, my, mxy (kN·m/m).
- Vista por **Caso**, **Combo** o **Envolvente**, y casillas para mostrar las cargas, las
  reacciones y las fuerzas en vínculos.
- Las **salidas** en tablas: reacciones, solicitaciones, desplazamientos, tensiones en losas y
  muros (por elemento y por nodo), fuerzas en vínculos y diagnósticos.
- **Consulta de resultados:** busca el valor gobernante de un esfuerzo en todo el modelo, en la
  selección o en una lista de elementos, con filtros, y lo exporta a CSV.
- **Reporte de esfuerzos crudos:** reacciones, desplazamientos y esfuerzos por barra y por
  estación, en Excel, PDF o HTML.
- **Deriva de piso:** para cada caso de sismo, la distorsión de cada piso con los desplazamientos
  elásticos multiplicados por Cd/γr (INPRES-CIRSOC 103, 6.4), contra el límite de la Tabla 6.4
  según el grupo de la construcción y si los elementos no estructurales pueden dañarse. Cd y el
  grupo salen de la configuración de sismo del proyecto.

### Avanzado

Los análisis avanzados de PRO:

- **P-Delta**, **modal**, **espectral** y **pandeo**. El espectral usa un espectro simplificado de
  INPRES-CIRSOC 103 por zona sísmica y tipo de suelo, combina los modos por CQC (combinación
  cuadrática completa) o SRSS (raíz cuadrada de la suma de los cuadrados) y requiere haber corrido
  antes el modal.
- **Historia en el tiempo** (métodos de Newmark o HHT-α, con una aceleración de base senoidal que
  genera el programa o un acelerograma propio pegado como lista de valores) y **respuesta
  armónica**.
- **No lineal:** **pushover** (formación sucesiva de rótulas plásticas bajo las cargas del modelo,
  con el mismo cálculo de Mp que el [colapso plástico](04-funciones-avanzadas.md#colapso-plástico)
  del modo Básico), corrotacional (grandes desplazamientos) y de fibras.
- **Imperfecciones geométricas**, **fundación sobre resortes de Winkler**, **interacción
  suelo-estructura** con curvas p-y y **contacto o gap**.
- **Construcción por etapas** y **fluencia y retracción**.
- **Líneas de influencia 3D**, **solver multi-caso**, **analizador de sección** y **análisis con
  restricciones**.
- **Cargas móviles:** un tren de ejes (predefinido o propio) recorre las barras seleccionadas, en
  orden, y cada barra guarda sus esfuerzos máximos y mínimos con la posición del tren. La carga de
  carril se crea como un caso de carga común sobre las mismas barras. La envolvente no entra en las
  combinaciones ni en el diseño.
- La opción **Diafragma rígido** para todo el modelo.

Estos análisis usan el eje de las barras, sin su excentricidad, y las articulaciones de las
columnas **Vinc. i** y **Vinc. j**. Las deslizaderas y las liberaciones por grado de libertad que se
definen al editar una barra se consideran en **Calcular**; antes de un análisis avanzado, el
programa pide quitarlas. El **modal** y el **espectral** trabajan con las barras del modelo: la
rigidez y la masa salen de las barras (y de las barras rígidas que agrega la opción **Diafragma
rígido**, si está activada).

### Reporte

**Reporte** arma una **memoria de cálculo** imprimible: datos del modelo, detalle de cargas,
resultados, los análisis avanzados que hayas corrido, cómputo de materiales y diagnósticos, con
un encabezado opcional (logo, empresa, profesional, revisión). También se exporta a Excel.

## La pestaña Diseño

### Otras normas

En la pestaña **Diseño**, **Otras normas** verifica las barras con **AISC 360**, **EN 1993-1-1**,
**AISI S100** (perfiles C con labios), **ACI 318** y **EN 1992-1-1**, con las combinaciones activas.
Al elegir una norma, un único cartel dice hasta dónde cubre. Las barras que la norma no puede
describir quedan afuera con el motivo, y una verificación a la que le falta un chequeo figura como
incompleta, nunca como cumplida. El hormigón se verifica con la armadura cargada en cada barra.

## La teoría detrás

- **Barras:** las mismas barras 3D de Euler-Bernoulli del modo Básico, con seis grados de
  libertad por nodo.
- **Placas cuadriláteras:** elemento **MITC4**, con deformaciones de corte interpoladas de forma
  que el elemento no se "trabe" cuando la placa es delgada (*shear locking*) y un refuerzo de la
  membrana (EAS) que mejora la flexión en su plano.
- **Placas triangulares:** elemento **DKT** para la flexión (placa delgada de Kirchhoff, sin
  deformación por corte), combinado con un triángulo de deformación constante para la membrana.
  Para tabiques, que trabajan a flexión en su plano, conviene usar cuadriláteros.
- **Cáscaras curvas:** un elemento de cuatro nodos que representa la curvatura, para
  cuadriláteros no planos.

Por qué una losa necesita malla y una viga no, qué es el *shear locking* y cuándo un modelo de
barras deja de alcanzar: [capítulo 6](06-fundamentos-teoricos.md#elementos-finitos-placas-y-cáscaras)
y la nota [¿barras o elementos finitos?](https://stabileo.com/es/blog/bars-or-finite-elements/).

---

[← Funciones avanzadas](04-funciones-avanzadas.md) · [Índice](README.md) · [Siguiente: Fundamentos teóricos →](06-fundamentos-teoricos.md)
