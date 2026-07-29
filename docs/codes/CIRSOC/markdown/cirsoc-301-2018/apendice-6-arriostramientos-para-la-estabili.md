# CIRSOC 301 (2018) — APÉNDICE 6. ARRIOSTRAMIENTOS PARA LA ESTABILI

> Source: `CIRSOC 301-2018.pdf` · PDF pages 303–310
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

DAD DE VIGAS Y COLUMNAS

Este Apéndice especifica la resistencia y la rigidez mínimas necesarias para
garantizar un punto de arriostramiento en una columna, una viga, una viga-columna y
un pórtico.

Su contenido está organizado de la siguiente manera:


<a id="c6.1"></a>
### 6.1 Especificaciones generales  <sub>p.303</sub>


<a id="c6.2"></a>
### 6.2 Arriostramientos de columnas  <sub>p.303</sub>


<a id="c6.3"></a>
### 6.3 Arriostramiento de vigas  <sub>p.303</sub>


<a id="c6.4"></a>
### 6.4 Arriostramiento de viga-columna  <sub>p.303</sub>


<a id="c6.5"></a>
### 6.5 Arriostramiento de pórticos  <sub>p.303</sub>



<a id="c6.1"></a>
### 6.1 ESPECIFICACIONES GENERALES  <sub>p.303</sub>


Estas especificaciones definen las mínimas resistencia y rigidez de las riostras
necesarias para asegurar la resistencia de diseño del elemento estructural arriostrado.

Una columna arriostrada en puntos extremos e intermedios con las especificaciones de la
Sección 6.2. de este Apéndice, puede ser proyectada con una longitud L entre puntos
arriostrados y con un factor de longitud efectiva k = 1. Las vigas con puntos de
arriostramiento intermedios que satisfagan las especificaciones de la Sección 6.3. de este
Apéndice podrán proyectarse basadas en la longitud lateralmente no arriostrada Lb igual a la
distancia entre puntos intermedios.

Cuando el arriostramiento sea perpendicular al elemento estructural que arriostra se
deberán emplear directamente las expresiones de las Secciones 6.2 y 6.3. Para
arriostramientos inclinados o diagonales la Resistencia Requerida de la riostra (fuerza o
momento) y la rigidez (fuerza por unidad de desplazamiento o momento por unidad de
rotación) deberá ser corregida por el ángulo de inclinación. La evaluación de la rigidez
suministrada por la riostra incluirá sus propiedades seccionales y geométricas como así
también los efectos de las uniones y detalles de anclaje.

Se consideran dos tipos generales de sistemas de arriostramiento: relativo y nodal
para columnas y para vigas con arriostramiento lateral. Para vigas con arriostramiento
torsional se especifican los sistemas de arriostramiento nodal y continuo.                El
arriostramiento relativo controla el movimiento del punto arriostrado respecto de los puntos
arriostrados adyacentes.

El arriostramiento nodal controla el movimiento del punto arriostrado sin la directa
interacción con los puntos arriostrados adyacentes. Un sistema de arriostramiento
continuo consiste en arriostramientos que están unidos al miembro en toda su longitud. Sin

Reglamento CIRSOC 301 – 2018                                                 Apéndice 6 - 249


<!-- page 303 -->

embargo sistemas de arriostramiento nodal con un espaciamiento regular pueden ser
modelados como un arriostramiento continuo.

La resistencia de diseño y la rigidez suministradas por el sistema de arriostramiento (riostras
y uniones) será mayor o igual que la resistencia y rigidez requeridas respectivamente, a
menos que el análisis indique que se justifiquen menores valores.

Los requerimientos de esta Sección pueden ser reemplazados por un análisis de segundo
orden que incluya un desplazamiento inicial fuera del plano de la estructura o una
deformación inicial fuera de la posición recta de los miembros para obtener la resistencia y
rigidez necesaria del arriostramiento.


<a id="c6.2"></a>
### 6.2 ARRIOSTRAMIENTO DE COLUMNAS  <sub>p.304</sub>


Una columna individual podrá ser arriostrada en puntos intermedios a lo largo de su longitud
por sistemas de arriostramiento relativo o nodal. Se supone que las riostras nodales están
igualmente espaciadas a lo largo de la columna.


<a id="c6.2.1"></a>
### 6.2.1 Sistema de arriostramiento relativo  <sub>p.304</sub>


La resistencia requerida de la riostra (kN) será:

                                      Pbr = 0,004 Pu                                          (6.1)

La rigidez requerida de la riostra (kN/cm) será:

                                                2 Pu
                                        br                                                  (6.2)
                                                 Lb
siendo:

         = 0,75

          Pu   la resistencia axil requerida a compresión de la columna, en kN.

        Lb     la distancia entre riostras, en cm.


<a id="c6.2.2"></a>
### 6.2.2 Sistema de arriostramiento nodal  <sub>p.304</sub>


La resistencia requerida de la riostra (kN) será:

                                      Pbr = 0,01 Pu                                           (6.3)

La rigidez requerida de la riostra (kN/cm) será:

                                                8 Pu
                                        br                                                  (6.4)
                                                 Lb


<!-- page 304 -->

siendo:

        = 0,75

Cuando la distancia real entre puntos arriostrados sea menor que Lq , siendo Lq la máxima
longitud efectiva kL para la carga axil requerida de la columna Pu, entonces se permite, en
las expresiones (6.2) y (6.4), tomar Lb igual a Lq .


<a id="c6.3"></a>
### 6.3 ARRIOSTRAMIENTO DE VIGAS  <sub>p.305</sub>


Los arriostramientos de vigas deben evitar el desplazamiento relativo entre las alas superior
e inferior, o sea, el giro de la sección. La estabilidad lateral de vigas deberá ser provista por
arriostramientos laterales, arriostramientos para torsión o combinación de ambos. En
miembros sometidos a flexión con doble curvatura el punto de inflexión no será considerado
un punto arriostrado, a menos que se haya ubicado una riostra en esa posición.


<a id="c6.3.1"></a>
### 6.3.1 Arriostramiento lateral  <sub>p.305</sub>


El arriostramiento lateral deberá ser unido cerca del ala comprimida, excepto en los
siguientes casos:

(1)   Para el extremo libre de una viga en voladizo, donde la riostra extrema deberá ser
      unida cerca del ala superior (en tracción).

(2)   Para vigas sometidas a flexión con doble curvatura a lo largo de la longitud arriostrada,
      el arriostramiento lateral deberá ser unido a ambas alas en el punto arriostrado
      cercano al punto de inflexión.

6.3.1(a). Sistema de arriostramiento relativo

La resistencia requerida de la riostra (kN) será:

                        Pbr = 0,008 Mu Cd (10)2/ ho                                         (6.5)

La rigidez requerida de la riostra (kN/cm) será:

                                                    2
                                 4 M u C d ( 10 )
                         br                                                               (6.6)
                                      Lb ho

siendo:

        = 0,75

          Mu   la resistencia requerida a flexión de la viga, en kNm.

       ho      la distancia entre centros de gravedad de las alas, en cm.

Reglamento CIRSOC 301 – 2018                                                     Apéndice 6 - 251


<!-- page 305 -->

        Cd = 1,0 para flexión con simple curvatura; Cd =2,0 para doble curvatura; Cd = 2
             sólo es aplicable para riostras cercanas al punto de inflexión.

        Lb     la distancia entre riostras, en cm.

6.3.1(b). Sistema de arriostramiento nodal

La resistencia requerida de la riostra (kN) será:

                         Pbr = 0,02 Mu Cd (10)2/ ho                                        (6.7)

La rigidez requerida de la riostra (kN/cm) será:

                                                       2
                                   10 M u C d ( 10 )
                           br                                                            (6.8)
                                         Lb ho

siendo:

         = 0,75

Cuando la distancia real entre puntos arriostrados sea menor que Lq , siendo Lq la máxima
distancia no arriostrada para desarrollar Mu , entonces se podrá utilizar en las expresiones
(6.6) y (6.8) el valor Lb igual a Lq.


<a id="c6.3.2"></a>
### 6.3.2 Arriostramientos para torsión  <sub>p.306</sub>


El arriostramiento torsional puede ser nodal o continuo a lo largo de la longitud de la
viga.

El arriostramiento puede ser unido en cualquier ubicación de la sección transversal y no
necesita ser unido cerca del ala comprimida. La unión entre el arriostramiento torsional y la
viga deberá ser apta para soportar el momento requerido dado más adelante en esta
Sección.

El arriostramiento para torsión puede ser proporcionado por una viga, un pórtico transversal
o un diafragma unidos al miembro por una unión que trasmita momento.

6.3.2(a). Sistema de arriostramiento nodal

La resistencia requerida a momento del arriostramiento (kNm) será:

                                   0 , 024 M u L
                         M br                                                             (6.9)
                                     n C b Lb


<!-- page 306 -->

La rigidez requerida (kNm/radián) del pórtico transversal o diafragma de arriostramiento
será:

                                      T
                         Tb                                                              (6.10)
                                 
                                        T 
                                  1         
                                 
                                       sec 
donde:

                                           2
                                   24 LM u
                        T 
                                                           2
                                                  ( 10 )                                    (6.11)
                                  n E I y Cb
                                            2

                                0 , 33 E  1 , 5 h o t w t s b s 
                                                        3       3
                                                                            2
                         sec                                    ( 10 )                (6.12)
                                  h o           12         12 

siendo:

          = 0,75

          L    la longitud de la viga arriostrada, en cm.

         n     el número de puntos arriostrados nodalmente dentro de la longitud de la viga.

         E     el módulo de elasticidad longitudinal del acero = 200 000 MPa.

         Iy    el momento de inercia de la sección transversal de la viga con respecto al eje
               de pandeo fuera del plano, en cm4.

         Cb    el factor de modificación definido en el Capítulo F.

          tw   espesor del alma de la viga, en cm.

         ts    el espesor del rigidizador de alma, en cm.

         bs    el ancho del rigidizador para rigidizadores de un solo lado. (usar el doble del
               ancho del rigidizador individual para pares de rigidizadores), en cm.

         T    la rigidez del arriostramiento excluida la distorsión del alma, en kNm/radián.

         sec la rigidez distorsional del alma, incluído el efecto de rigidizadores transversales
               del alma, cualquiera sean ellos, en kNm/radián.

Si sec < T, la expresión (6.10) da valores negativos, lo cual indica que el sistema de
arriostramiento torsional de la viga puede no ser efectivo debido a una inadecuada rigidez
distorsional del alma.

Reglamento CIRSOC 301 – 2018                                                      Apéndice 6 - 253


<!-- page 307 -->

Cuando sea necesario, el rigidizador del alma se extenderá en toda su altura y se deberá
unir al ala si el arriostramiento torsional también está unido al ala. Alternativamente se
permitirá que el extremo del rigidizador termine a una distancia de 4 tw desde cada ala de la
viga que no esté directamente unida al arriostramiento torsional.

Cuando la distancia real entre puntos no arriostrados sea menor que Lq, siendo Lq la
máxima distancia no arriostrada para desarrollar Mu, se podrá utilizar en la expresión (6.9)
Lb igual a Lq .

6.3.2(b). Sistema de arriostramiento torsional continuo

Para arriostramientos continuos se usarán las expresiones (6.9), y (6.10) con las siguientes
modificaciones:

    (1) (L / n) = 1 ;

    (2) Lb será tomada igual a la máxima longitud no arriostrada permitida para la viga
        basada en la resistencia requerida a flexión Mu .

    (3) La rigidez distorsional para un alma no rigidizada (kNm/m radián) será:

                                               3
                                    0 , 33 E t w
                           sec                                                             (6.13)
                                      12 h o


<a id="c6.4"></a>
### 6.4 ARRIOSTRAMIENTO DE VIGA-COLUMNA  <sub>p.308</sub>


Para el arriostramiento de una viga-columna, la resistencia y rigidez requeridas para fuerza
axil se determinarán con las especificaciones de la Sección 6.2., y la resistencia y rigidez
requeridas para flexión serán determinadas con las especificaciones de la Sección 6.3..

El valor determinado será una combinación de lo siguiente:

    (a) Cuando se utilice un arriostramiento lateral relativo, la resistencia requerida será
        tomada como la suma de los valores determinados con las expresiones (6.1) y (6.5), y
        la rigidez requerida se tomará como la suma de los valores determinados con las
        expresiones (6.2) y (6.6).

    (b) Cuando se utilice un arriostramiento lateral nodal, la resistencia requerida será tomada
        como la suma de los valores determinados con las expresiones (6.3) y (6.7), y la rigidez
        requerida se tomará como la suma de los valores determinados con las expresiones
        (6.4) y (6.8). En las expresiones (6.4) y (6.8), Lb para la viga-columna será tomado
        como la longitud no arriostrada real y no se considerará lo especificado en las
        Secciones 6.2.2. y 6.3.1(b) que señalan que Lb no necesita considerarse menor que la
        máxima longitud efectiva permitida basada en Pu y Mu.

    (c) Cuando un arriostramiento torsional sea proporcionado para flexión, combinado con un
        arriostramiento relativo o nodal para fuerza axil, la resistencia y rigidez requeridas serán


<!-- page 308 -->

          combinadas o distribuidas de manera que sean consistentes con la resistencia provista
          por el detalle (o detalles) reales del arriostramiento.


<a id="c6.5"></a>
### 6.5 ARRIOSTRAMIENTO DE PÓRTICOS  <sub>p.309</sub>


En pórticos arriostrados cuya estabilidad lateral sea provista por sistemas reticulados,
tabiques de hormigón armado o mampostería, u otros medios equivalentes, la fuerza de
corte requerida (kN) por piso o panel arriostrado será :

                                   Pbr = 0,004  Pu                                    (6.14)

La rigidez lateral requerida (kN/cm) por piso o panel será:

                                             2  Pu
                                     br                                             (6.15)
                                              L
siendo:

                = 0,75

        Pu      la sumatoria de las resistencias axiles requeridas de las columnas del piso o
                 panel soportado por el arriostramiento, debidas a acciones mayoradas, en
                 kN.

       L         la altura del piso o espaciamiento de paneles, en cm.

Estos requerimientos para la estabilidad del piso serán combinados con las fuerzas laterales
y los requerimientos de desplazamiento lateral debidos a otras causas, tales como acciones
de viento o sísmicas.

Reglamento CIRSOC 301 – 2018                                                    Apéndice 6 - 255


<!-- page 309 -->



<!-- page 310 -->
