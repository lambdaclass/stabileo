# 3. Modo Básico en 3D

El botón **3D** del grupo **Vista** lleva el modelo al espacio. Sigue siendo el modo Básico —las
mismas herramientas, la misma lógica de barras—, pero cada nodo pasa de tener tres grados de
libertad a tener **seis**: tres desplazamientos (**ux**, **uy**, **uz**) y tres giros (**θx**,
**θy**, **θz**).

![Un pórtico espacial en el modo Básico 3D, con el diagrama de momento My](img/basic-3d-frame.webp)

## Los ejes

El eje **Z es vertical, hacia arriba**; **X** e **Y** son horizontales. La gravedad apunta hacia
−Z. Un modelo 2D, que vive en el plano XZ, aparece parado en ese mismo plano al pasar a 3D.

Además de los ejes globales, **cada barra tiene sus ejes locales**:

- **x local** va a lo largo de la barra, del nodo I al nodo J.
- **z local** es la vertical global proyectada perpendicular a la barra. En una viga horizontal
  apunta hacia arriba.
- **y local** completa la terna (y = z × x).
- En las barras verticales, donde la vertical no sirve de referencia, se usa el eje X global.

Los esfuerzos se expresan en esos ejes locales. Por eso, en una viga horizontal cargada por
gravedad, el momento principal es **My** (flexión alrededor del eje y local) y el corte que lo
acompaña es **Vz**.

> En **Ajustes** se elige si la terna local es derecha o izquierda. Eso cambia el signo de algunos
> esfuerzos y de qué lado se dibujan los diagramas, no su magnitud.

## Qué cambia respecto de 2D

| | 2D | 3D |
|---|---|---|
| Grados de libertad por nodo | 3 | 6 |
| Esfuerzos | N, Vz, My | N, Vy, Vz, T, My, Mz |
| Matriz de una barra | 6 × 6 | 12 × 12 |
| Tensiones en la sección | flexión en un plano | flexión biaxial y torsión |

Los botones de **Resultados** suman **Mz**, **Vy** y **T** (torsión).

### Nodos

Los nodos se dibujan sobre un **plano de trabajo** (XY, XZ o YZ) a un **nivel** dado: por
ejemplo, el plano XY a la altura del primer piso.

### Apoyos

En 3D, un apoyo se define marcando qué restringe: tres desplazamientos (Fx, Fy, Fz) y tres giros
(Mx, My, Mz). Los atajos **Empot.** (los seis) y **Artic.** (los tres desplazamientos) resuelven
los casos habituales. A cada grado de libertad no restringido se le puede dar una rigidez de
resorte. Los apoyos móviles inclinados y los desplazamientos impuestos son opciones del modo 2D.

### Cargas

- **Nodales:** Fx, Fy, Fz, Mx, My, Mz.
- **Distribuidas:** en las direcciones **y** y **z locales** de la barra, con un valor en cada
  extremo.
- **Peso propio:** igual que en 2D.

> **Ojo con la dirección por defecto.** En 3D, la carga puntual arranca en **Fy** y la distribuida
> en la dirección **y local**, que en una viga horizontal son horizontales. Para cargas de gravedad
> usá **Fz** en los nodos y **qZ** (z local) en las barras, y poné **qYI** y **qYJ** en 0: si no,
> la barra recibe también la carga horizontal que viene por defecto.

Las cargas térmicas y las cargas puntuales en el tramo de una barra se cargan en 2D; al pasar el
modelo a 3D se conservan y se calculan.

### Articulaciones

En 3D, una articulación libera cualquier combinación de los seis movimientos relativos entre el
extremo de la barra y el nodo. Se define con el modo **Articulaciones** de la herramienta **Nodo**:
se marcan los movimientos a liberar (dx, dy, dz, θx, θy, θz) y se hace clic sobre la barra, cerca
del extremo. Las deslizaderas son propias del modelo 2D.

> En un modelo con geometría 3D, las columnas **Art. I** y **Art. J** de la tabla de barras liberan
> **sólo el momento Mz**. En una viga horizontal el momento de gravedad es **My**, así que para
> articularla frente a la gravedad hay que liberar θy con el modo **Articulaciones**. En un modelo
> que sigue siendo plano, como uno traído desde 2D, esas columnas liberan el momento en su plano,
> igual que en 2D.

### Torsión

Una barra 3D puede trabajar a torsión, y para eso necesita la constante **J** de su sección. Las
secciones de catálogo y las construidas por forma la traen calculada. Si definís una sección
amorfa, cargá J a mano, para que la torsión se calcule con el valor que corresponde a la sección.

## Volver a 2D

El mismo botón, que ahora dice **2D**, lleva el modelo al plano. Si el modelo es plano de verdad,
el cambio es directo. Si no, el programa pregunta qué hacer:

1. **El plano:** XZ, YZ o XY.
2. **Qué tomar:**
   - **Un pórtico, cortado a una distancia.** Toma sólo lo que está en ese plano, a la distancia
     elegida: "dame el pórtico del eje 3". El programa lista los cortes posibles con sus barras,
     apoyos y cargas, y avisa si alguno quedaría sin apoyos o sin cargas.
   - **Toda la estructura, aplastada.** Proyecta todo sobre el plano. Sirve para ver la
     estructura de costado, pero superpone pórticos.
3. Con el plano y la opción elegidos, **Pasar a 2D** hace el cambio. También están **Seguir en 3D**,
   para quedarse como estaba, y **Borrar modelo y pasar a 2D**, para empezar de cero en el plano.

El modelo 3D original se guarda: al volver a tocar **3D**, se recupera tal como estaba. Los cambios
que hayas hecho sobre el corte 2D no pasan al modelo 3D.

---

[← Modo Básico en 2D](02-basico-2d.md) · [Índice](README.md) · [Siguiente: Funciones avanzadas →](04-funciones-avanzadas.md)
