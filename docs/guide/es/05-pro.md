# 5. Modo PRO

El modo PRO es el de **elementos finitos y modelos complejos**. Además de barras en el espacio,
modela **placas y cáscaras** —losas, tabiques, muros, plateas—, vínculos entre nodos, cargas
generadas según norma, y corre análisis dinámicos y no lineales.

> PRO está **en desarrollo**, con acceso libre para quien quiera probarlo. Lo que se describe acá
> ya funciona; al final del capítulo están las limitaciones que conviene conocer.

Este capítulo cubre las pestañas **Modelo** y **Análisis**.

![Un modelo en PRO: pórtico de hormigón con una losa y un tabique modelados como placas](img/pro-model.webp)

## Cómo entrar y cómo empezar un modelo

Se entra con el botón **PRO** del encabezado. PRO guarda **su propio modelo**, separado del de
Básico: al cambiar de modo, cada uno conserva el suyo, pero no se trasladan.

Para empezar:

- **Un modelo vacío:** el **+** de las pestañas.
- **Un ejemplo:** **Proyecto → Modelo nuevo → Ejemplos**. Hay dieciséis, agrupados en edificios,
  industriales, fundaciones, estructuras de gran luz, energía y offshore, y modelos grandes de
  demostración.
- **Importar** (ver [más abajo](#importar-modelos)): una planilla de Excel, un plano de AutoCAD
  (DXF) o un modelo BIM (IFC).

## La pestaña Modelo

En PRO, cada botón de la cinta abre un **panel con una tabla**. Para dibujar en el visor, cada
panel tiene su botón **Dibujar** (nodo, barra, placa…); al tocarlo de nuevo se vuelve a
seleccionar.

### Dibujar

**Nodos.** Una tabla editable de coordenadas X, Y, Z en metros. Se puede **pegar desde Excel**
(columnas X, Y y opcionalmente Z).

**Barras.** Una tabla con nodo inicial y final, material, sección y el vínculo de cada extremo.
Además:

- **Curva:** un arco que pasa por tres nodos, materializado como una cadena de barras rectas. El
  panel informa el error de cuerda.
- **Excentricidad de barra (offset):** desplaza el eje de la barra respecto de sus nodos, por
  ejemplo para que una viga cuelgue de la losa.
- Con clic derecho sobre una barra: editarla (material, sección, articulaciones por grado de
  libertad), dividirla en N partes o reflejarla.

**Placas.** Una placa se define por sus nodos: **tres nodos forman un triángulo y cuatro un
cuadrilátero**. Se le asigna material y espesor.

- **Generador de malla:** a partir de cuatro esquinas, genera una malla de cuadriláteros por
  tamaño objetivo o por cantidad de divisiones. Puede partir las vigas del contorno para que
  compartan los nodos del borde.
- **Cáscara (con curvatura):** para cuadriláteros cuyos cuatro nodos no están en un mismo plano.
  El panel mide cuánto se aparta el cuarto nodo y sugiere cuándo usarla.
- **Escalera:** una losa inclinada con los escalones aplicados como carga.
- **Offset de losa o muro:** desplaza el plano medio de la placa, por ejemplo para alinear la cara
  superior de la losa con el nivel de piso.

> **Cómo se conectan las placas con las barras:** sólo a través de **nodos compartidos**. Una
> viga que pasa por debajo de una losa sin compartir nodos con ella no está conectada. El panel
> avisa cuando una placa tiene una esquina suelta.

**Repetir selección.** Copia los nodos y barras seleccionados N veces con un desplazamiento dado.
Puede unir las copias con barras (por ejemplo, las columnas entre pisos) y copiar también los
apoyos.

### Propiedades

**Materiales** y **Secciones** funcionan como en Básico: una biblioteca (aceros, hormigones,
maderas, aluminio; perfiles laminados y conformados) o definiciones a medida. En secciones,
**Construir sección** arma formas paramétricas, y en los perfiles de catálogo se puede elegir la
rotación y componer secciones.

### Condiciones

**Apoyos.** Empotrado, articulado, deslizantes en cada plano (XZ, XY, YZ), resorte (con rigidez
en cada grado de libertad) y **personalizado**, donde se marca uno por uno qué desplazamientos y
giros se restringen.

**Vínculos.** Relaciones entre nodos:

- **Vínculo rígido:** un nodo esclavo sigue a un nodo maestro como si estuvieran unidos por una
  barra infinitamente rígida.
- **Diafragma:** los nodos de un plano se mueven juntos en ese plano. Es la hipótesis habitual
  de losa rígida en su plano. **Auto-detectar diafragmas** agrupa los nodos por nivel.
- **DOF iguales:** dos nodos comparten uno o más grados de libertad.
- **Conexión excéntrica**, **MPC lineal** (restricciones lineales generales) y **conectores**
  con rigidez propia entre dos nodos.

**Cargas.** El panel tiene tres partes:

- **Casos de carga:** cada caso con su tipo (D, L, Lr, W, E, S). El **peso propio** está
  **activado por defecto** en PRO y se calcula para barras y placas.
- **Combinaciones:** manuales, o generadas automáticamente (combinaciones de resistencia y de
  servicio).
- **Agregar carga:** nodal (en ejes globales), distribuida y puntual sobre barras (en ejes
  locales de la barra), y **de superficie** sobre placas cuadriláteras (en kN/m²).

**Auto-generar desde norma.** Arma el plan de cargas del edificio a partir de la normativa
argentina:

- **Cargas permanentes** a partir de las capas de la construcción (CIRSOC 101, Tabla 3.1).
- **Sobrecarga de uso** según el destino de cada local, con la reducción por área tributaria.
- **Viento** según CIRSOC 102.

Primero muestra el plan de cargas para revisarlo y después lo aplica. Las cargas de superficie se
transforman en cargas lineales sobre las vigas, según su ancho tributario; el viento se aplica
como fuerzas por nivel.

### Generadores

**Estructuras metálicas** genera la **geometría** de estructuras típicas de acero:

- **Cercha:** trapezoidal, de cordones paralelos, Pratt, en arco o pórtico de alma llena, con
  distintos patrones de diagonales.
- **Columna reticulada.**
- **Nave industrial:** luz, separación entre pórticos, cantidad de pórticos, columnas
  reticuladas o de alma llena, correas y arriostramientos.

El generador **reemplaza el modelo actual** (se deshace con un solo paso).

## Importar modelos

Desde **Proyecto**:

- **Planilla de Excel.** El mismo formato que en Básico, con hojas adicionales para placas,
  vínculos y cargas. Es la forma más cómoda de cargar un modelo grande armado en otra herramienta.
- **Plano DXF (AutoCAD).** Un asistente de cuatro pasos:
  1. el archivo y sus unidades;
  2. qué representa cada capa del dibujo: ejes, columnas, vigas, tabiques, losas, aberturas;
  3. los supuestos: cantidad de pisos y alturas, dimensiones de columnas, vigas, losas y
     tabiques, tipo de apoyo en la base, cargas y mallado de losas;
  4. una vista previa antes de aplicar.

  El resultado es un **borrador** de la estructura, marcado como no revisado, con la lista de
  supuestos que se usaron. Las losas y los tabiques se generan como placas.
- **IFC (BIM).** Importa las vigas, columnas y miembros del modelo con su geometría.

## Antes de calcular: diagnósticos

PRO revisa el modelo mientras lo armás. El panel **Diagnósticos** separa:

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

- **Mapa de colores** de momento, corte, axial, aprovechamiento σ/fy, Von Mises o **contorno de
  losas y muros**.
- Para las placas, la componente a ver: Von Mises, tensiones principales σ1 y σ2, σxx, σyy, τxy
  (kN/m²) y momentos por unidad de ancho mx, my, mxy (kN·m/m).
- Vista por **caso**, **combinación** o **envolvente**.
- Las **salidas** en tablas: reacciones, solicitaciones, desplazamientos, tensiones en losas y
  muros (por elemento y por nodo), fuerzas en vínculos y diagnósticos.
- **Consulta de resultados:** busca el valor gobernante de un esfuerzo en todo el modelo, en la
  selección o en una lista de elementos, con filtros, y lo exporta a CSV.
- **Reporte de esfuerzos crudos:** reacciones, desplazamientos y esfuerzos por barra y por
  estación, en Excel, PDF o HTML.

### Avanzado

Los análisis avanzados de PRO:

- **P-Delta**, **modal**, **espectral** (con combinación CQC o SRSS, por zona sísmica y tipo de
  suelo) y **pandeo**.
- **Historia en el tiempo** (métodos de Newmark o HHT-α, con un acelerograma propio) y
  **respuesta armónica**.
- **No lineal:** pushover, corrotacional (grandes desplazamientos) y de fibras.
- **Imperfecciones geométricas**, **fundación sobre resortes de Winkler**, **interacción
  suelo-estructura** con curvas p-y y **contacto o gap**.
- **Construcción por etapas** y **fluencia y retracción**.
- **Líneas de influencia 3D**, **solver multi-caso** y **analizador de sección**.
- La opción **diafragma rígido** para todo el modelo.

El panel lleva la leyenda "En desarrollo": son análisis que el motor resuelve y que todavía se
están integrando a la interfaz.

### Reporte

**Reporte** arma una **memoria de cálculo** imprimible: datos del modelo, detalle de cargas,
resultados, los análisis avanzados que hayas corrido, cómputo de materiales y diagnósticos, con
un encabezado opcional (logo, empresa, profesional, revisión). También se exporta a Excel.

## La teoría detrás

- **Barras:** las mismas barras 3D de Euler-Bernoulli del modo Básico, con seis grados de
  libertad por nodo.
- **Placas cuadriláteras:** elemento **MITC4**, con deformaciones de corte interpoladas de forma
  que el elemento no se "trabe" cuando la placa es delgada (*shear locking*) y un refuerzo de la
  membrana (EAS) que mejora la flexión en su plano.
- **Placas triangulares:** elemento **DKT** para la flexión, combinado con un triángulo de
  deformación constante para la membrana.
- **Cáscaras curvas:** un elemento de cuatro nodos que representa la curvatura, para
  cuadriláteros no planos.

Por qué una losa necesita malla y una viga no, qué es el *shear locking* y cuándo un modelo de
barras deja de alcanzar: [capítulo 6](06-fundamentos-teoricos.md#elementos-finitos-placas-y-cáscaras)
y la nota [¿barras o elementos finitos?](https://stabileo.com/es/blog/bars-or-finite-elements/).

## Stabileo IA

El botón **AI** del encabezado abre el asistente, con cuatro modos: construir, revisar, explicar y
consultar un modelo. Trabaja sobre el mismo modelo y el mismo motor: la IA propone el cambio y el
motor calcula. **Está en desarrollo** y todavía no responde ni modifica el modelo.

## Limitaciones actuales

- El **análisis modal y el espectral** consideran sólo las barras: todavía no incluyen las placas
  ni los vínculos. Los análisis avanzados, en general, necesitan al menos una barra en el modelo
  y no consideran las excentricidades de barras y placas.
- La **carga de superficie** se aplica sólo a placas cuadriláteras, siempre vertical (−Z global),
  repartida en partes iguales entre los cuatro nodos.
- La **carga térmica en losas** todavía no se aplica en el cálculo.
- La **generación automática de cargas** no carga las placas, y la de sismo todavía no está
  habilitada por defecto.
- En PRO las barras nuevas son siempre de pórtico. Las de reticulado llegan desde los
  generadores, desde IFC o desde Excel, que también es la vía para rotar los ejes locales de una
  barra.
- La importación **IFC** trae vigas, columnas y miembros, con un único material y una única
  sección para todos; no trae apoyos, cargas, losas ni muros.
- Cambiar entre Básico y PRO **no traslada el modelo**.

---

[← Funciones avanzadas](04-funciones-avanzadas.md) · [Índice](README.md) · [Siguiente: Fundamentos teóricos →](06-fundamentos-teoricos.md)
