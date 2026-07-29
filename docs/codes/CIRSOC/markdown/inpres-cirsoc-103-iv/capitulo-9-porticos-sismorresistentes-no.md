# INPRES-CIRSOC 103 Parte IV (2005) — CAPÍTULO 9. PÓRTICOS  SISMORRESISTENTES                                               NO

> Source: `INPRES-CIRSOC-103_Parte_IV-Reglamento.pdf` · PDF pages 41–52
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

ARRIOSTRADOS ESPECIALES


<a id="c9.1"></a>
### 9.1 INTRODUCCIÓN  <sub>p.41</sub>


Se espera que los pórticos sismorresistentes no arriostrados especiales definidos en el
artículo 3.4.a) desarrollen importantes deformaciones inelásticas cuando se encuentren
sometidos al terremoto de diseño. Estos pórticos deberán cumplir con los requerimientos
establecidos en este Capítulo.


<a id="c9.2"></a>
### 9.2 NUDOS VIGA-COLUMNA Y UNIONES  <sub>p.41</sub>


a)   El diseño de todos los nudos viga-columna y sus uniones usados en el Sistema
     Principal Sismorresistente deberá basarse en los resultados de ensayos cíclicos de
     habilitación de acuerdo con lo especificado en el Apéndice, que demuestren una
     distorsión lateral de piso de al menos 0,04 radianes.

     Se permite que los resultados de los ensayos estén basados en uno de los siguientes
     requerimientos:

     1) Informes de ensayos de investigaciones o ensayos documentados ejecutados
        para otros proyectos que demuestren una razonable semejanza con las
        condiciones del caso que se analiza.

     2) Ensayos ejecutados específicamente para el proyecto y que sean representativos
        de las dimensiones de los elementos, resistencia de los materiales, configuración
        de las uniones y procesos constructivos.

     En cualquiera de los requerimientos anteriores los resultados deberán basarse en al
     menos dos ensayos cíclicos.

     Las interpolaciones o extrapolaciones de los resultados de los ensayos para
     elementos con diferentes dimensiones deberán justificarse por medio de análisis
     racionales que demuestren que la distribución y la magnitud de las tensiones internas
     sean consistentes con los modelos ensayados y que consideren los efectos adversos
     de mayores dimensiones de elementos, mayores espesores de soldaduras y
     variaciones en las propiedades del material. Las extrapolaciones de los resultados de
     los ensayos deberán basarse en combinaciones similares de las dimensiones de los
     elementos.

     Las uniones reales deberán construirse usando materiales, procesos, configuraciones
     y controles de calidad que se asemejen tanto como sea posible, a los utilizados en las
     uniones ensayadas. Como mínimo, el control de calidad deberá cumplir con los
     procedimientos del Capítulo 16.

Reglamento INPRES-CIRSOC 103, Parte IV                                           Cap. 9 - 27


<!-- page 41 -->

     No deberán usarse en los ensayos requeridos, vigas con una tensión de fluencia real
     que sea menor que 0,85 Fye . No deberán usarse en ensayos de habilitación columnas
     y elementos de uniones con una tensión de fluencia proveniente de ensayos que se
     aparte 15 % en más o en menos de Fye.

b)   Los ensayos de los nudos viga-columna deberán demostrar una resistencia a la
     flexión, determinada en la cara de la columna, que sea al menos igual que el momento
     plástico nominal de la viga Mp , para la rotación inelástica requerida (ver Apéndice).

     Esta prescripción se exceptúa para los siguientes casos:

     1)    La resistencia a la flexión mínima de la viga ensayada deberá ser 0,8 Mp cuando
           el pandeo local y no la fluencia de la viga limite la resistencia a la flexión de esta
           última o cuando se utilicen secciones reducidas de vigas.

     2)    Se permiten uniones que puedan desarrollar las rotaciones requeridas en los
           elementos de unión y la resistencia de diseño según lo establece el Capítulo 1,
           siempre que pueda demostrase por un análisis racional que cualquier distorsión
           adicional de piso debida a las deformaciones de la unión, pueda ser absorbida por
           el edificio. Este análisis racional deberá incluir la estabilidad global del pórtico
           considerando los efectos de segundo orden.

c)   La resistencia requerida al corte Vu de la unión entre la viga y la columna, se
     determinará usando la combinación de cargas 1,2 D + 0,5 L + 0,2 S más el corte
     resultante de la aplicación de 1,1 Ry Fy Z, en el sentido opuesto en cada extremo de la
     viga. Alternativamente, se permite un valor de Vu menor si queda justificado por un
     análisis racional. No es necesario que la resistencia requerida al corte exceda el corte
     resultante de la combinación especial de estados de carga, establecida en la
     expresión (5-3).


<a id="c9.3"></a>
### 9.3 PANEL NODAL  <sub>p.42</sub>


(Alma de la viga paralela al alma de la columna)


<a id="c9.3.1"></a>
### 9.3.1 Introducción  <sub>p.42</sub>


El panel nodal es el área rectangular del alma de la columna en la intersección con la viga,
circunscripta por las alas de la columna y por las placas de continuidad.


<a id="c9.3.2"></a>
### 9.3.2 Resistencia al corte  <sub>p.42</sub>


La resistencia requerida al corte del panel nodal Ru , se determinará aplicando las
combinaciones especiales de estados de carga establecidas en las expresiones (5-3) y
(5-4) a la viga o vigas que concurren al nudo en el plano del pórtico. No es necesario que
Ru sea mayor que el corte determinado a partir de 0,80 Σ Ry Mp , de las vigas que
concurren a las alas de la columna en la unión.


<!-- page 42 -->

La resistencia de diseño al corte φv Rv del panel nodal deberá determinarse utilizando
φv = 0,75.

   • Cuando Pu ≤ 0,75 Py
                                                    ⎡            2 ⎤
                                                         3 bcf t cf
                                  Rv = 0,6 Fy dc tp ⎢1 +            ⎥                (9-1)
                                                    ⎢    d b dc t p ⎥
                                                    ⎣               ⎦
      siendo:
             tp       el espesor total del panel nodal incluyendo las placas nodales de
                      refuerzo, en mm.

               dc     la altura total de columna, en mm.

               bcf    el ancho del ala de la columna, en mm.

               tcf    el espesor del ala de la columna, en mm.

               Fy     la tensión nominal de fluencia del acero del panel nodal, en MPa.

   • Cuando Pu > 0,75 Py , Rv se determinará utilizando la expresión K.1-12, establecida
     en el Reglamento CIRSOC 301-2005.


<a id="c9.3.3"></a>
### 9.3.3 Espesor del panel nodal  <sub>p.43</sub>


Los espesores individuales de las almas de la columna y de las placas nodales de
refuerzo, si las hubiere, deberán cumplir con la siguiente expresión:

                                  t ≥ (dz + wz) / 90                                (9-2)

siendo:

        t        el espesor del alma de columna o placa nodal de refuerzo, en mm.

        dz       la altura del panel nodal entre las placas de continuidad en mm.

        wz       el ancho del panel nodal entre las alas de columna en mm.

Alternativamente, cuando se utilicen soldaduras tipo tapón para prevenir el pandeo del
alma de la columna y de las placas de refuerzo, el espesor total del panel nodal deberá
satisfacer la expresión (9-2).


<a id="c9.3.4"></a>
### 9.3.4 Placas nodales de refuerzo  <sub>p.43</sub>


Las placas nodales de refuerzo deberán soldarse a las alas de la columna ya sea usando
soldadura a tope con penetración completa o soldadura en filete. La soldadura deberá
desarrollar al menos, la resistencia de diseño al corte de las mencionadas placas.

Reglamento INPRES-CIRSOC 103, Parte IV                                              Cap. 9 - 29


<!-- page 43 -->

Cuando las placas nodales de refuerzo estén en contacto con el alma de la columna
deberán soldarse en los bordes superior e inferior, de manera que puedan transmitir la
parte del esfuerzo total absorbido por dicha placa.

Cuando las placas nodales de refuerzo se ubiquen separadas del alma de la columna
deberán ubicarse simétricamente y soldarse a las placas de continuidad para transmitir la
parte del esfuerzo total absorbido por la mencionada placa nodal.


<a id="c9.3.5"></a>
### 9.3.5 Placas de continuidad  <sub>p.44</sub>


En los nudos viga-columna siempre deberán proveerse placas de continuidad.


<a id="c9.4"></a>
### 9.4 LIMITACIONES DIMENSIONALES DE VIGAS Y COLUMNAS  <sub>p.44</sub>



<a id="c9.4.1"></a>
### 9.4.1 Área del ala de viga  <sub>p.44</sub>


No se permiten cambios abruptos en el área del ala de viga ubicada en regiones de
probable rótula plástica. Se permite agujerear o cortar el ala de viga, siempre que se
demuestre a través de ensayos que la configuración resultante permita la formación de
rótulas plásticas estables y que cumplan con los requerimientos establecidos en el artículo
9.2.b). La sección reducida de viga cumplirá con la resistencia de diseño especificada en
el Capítulo 1.


<a id="c9.4.2"></a>
### 9.4.2 Relación ancho-espesor  <sub>p.44</sub>


Las vigas deberán cumplir con los valores de λp establecidos en la Tabla B.5.1 del

Cuando la relación establecida en la expresión 9.5.a) sea menor o igual que 1,25 las
columnas deberán cumplir con los valores de λp establecidos en la Tabla 9.1.

Cuando sea mayor que 1,25 las columnas deben cumplir con λp especificadas en la Tabla
B.5.1 del Reglamento CIRSOC 301-2005.


<!-- page 44 -->

Tabla 9.1. Limitaciones de la relación ancho-espesor

                                                                    Limitaciones de la relación
                                                 Relación
 DESCRIPCIÓN DEL ELEMENTO                                                 ancho-espesor
                                              ancho-espesor
                                                                    λp (secciones compactas)
Alas de vigas de perfiles                                                        136
laminados doble T, vigas híbridas                  b/t                            Fy
o soldadas y secciones U a flexión
                                                                Para: Pu / (φb Py) ≤ 0,125

                                                                       1365 ⎡            Pu ⎤
                                                                             ⎢1 − 1,54         ⎥
                                                                         Fy ⎢⎣         φ b Py ⎥⎦
Almas bajo combinaciones                 de
                                                  h c / tw      Para: Pu / (φb Py) > 0,125
flexocompresión

                                                                     502 ⎡           Pu ⎤ 664
                                                                          ⎢2 ,33 −         ⎥≥
                                                                      Fy ⎢⎣        φ b Py ⎥⎦  Fy

Tubos de sección circular en                                                    8964
                                                   D/t                           Fy
compresión simple o flexión

Tubos de sección rectangular en                                                  758
                                               b / t o hc / t                     Fy
compresión simple o flexión


<a id="c9.5"></a>
### 9.5 RELACIÓN ENTRE LAS RESISTENCIAS A FLEXIÓN DE VIGAS Y  <sub>p.45</sub>

        COLUMNAS

En los nudos viga-columna deberá satisfacerse la siguiente relación:

                                          Σ M*pc / Σ M*pb > 1                                   (9-3)

siendo:
       Σ M*pc     la suma de las proyecciones al eje de la viga, de las resistencias
                  nominales a flexión esperadas de las columnas (incluyendo cartelas si
                  existieran), por encima y por debajo del nudo, teniendo en cuenta la
                  reducción debida al esfuerzo normal en la columna.
                  Se permite tomar:

                                     Σ M*pc = Σ Zc ( Fyc – Puc /Ag )                            (9-4)

                  Cuando los ejes de vigas opuestas en el mismo nudo no coinciden deberá
                  considerarse el eje intermedio.

Reglamento INPRES-CIRSOC 103, Parte IV                                                       Cap. 9 - 31


<!-- page 45 -->

       Σ M*pb         la suma de las proyecciones al eje de la columna, de las resistencias
                      nominales a flexión de la viga o las vigas que concurran al nudo.

                      Se permite tomar:

                                        Σ M*pb = Σ ( 1,1 Ry Mp + Mv )                   (9-5)

         Mv,          el momento adicional debido a la amplificación producida por el corte
                      desde la rótula plástica hasta el eje de la columna.

Alternativamente, se permite tomar Σ M*pb de los resultados de ensayos tal como se
requiere en el artículo 9.2.a).

Cuando se utilicen secciones reducidas de vigas se permite tomar:

                                        Σ M*pb = Σ ( 1,1 Ry Fy z + Mv )                 (9-6)

siendo en las expresiones b), c) y d):

                  z        el módulo de sección plástico mínimo de la sección reducida de viga,
                           en mm3.

                  Ag       el área bruta de la columna, en mm2.

                  Fyc      la tensión nominal de fluencia de la columna, en MPa.

                  Puc      la resistencia requerida a compresión axial de la columna (signo
                           positivo), en N.

                  Zc       el módulo plástico de la sección de la columna, en mm3.


<a id="c9.5.1"></a>
### 9.5.1 Excepciones  <sub>p.46</sub>


Se exceptúan de la condición anterior los siguientes casos:

a) Columnas con Puc < 0,3 Fyc Ag, para todas las combinaciones de carga que no sean
   las combinaciones especiales de los estados de carga establecidos en el artículo 5.4.,
   y que cumplan con los siguientes requisitos:

   1) Columnas en edificios de un piso o en el piso superior de edificios de varios pisos.

   2) Columnas donde:

         • La suma de las resistencias de diseño al corte de todas las columnas en el piso,
           exceptuadas por cumplir con la expresión (9-3), sea menor que el 20 % de la
           resistencia al corte requerida en el piso.


<!-- page 46 -->

           • La suma de las resistencias de diseño al corte de todas las columnas
             exceptuadas por cumplir con la expresión (9-3), ubicadas en cada línea de
             columna en el piso, sea menor que el 33 % de la resistencia requerida al corte del
             piso en la línea de columnas. Se entiende por una línea de columnas a una sola
             línea de columnas o líneas paralelas de columnas ubicadas dentro del 10 % de la
             dimensión de la planta perpendicular a la línea de columnas.

b) Columnas en cualquier piso que tengan una relación entre la resistencia de diseño al
   corte y la resistencia requerida al corte, que sea 50 % mayor que la del piso
   inmediatamente superior.


<a id="c9.6"></a>
### 9.6 RESTRICCIÓN LATERAL DE NUDOS VIGA-COLUMNA  <sub>p.47</sub>



<a id="c9.6.1"></a>
### 9.6.1 Nudos restringidos  <sub>p.47</sub>


a)    Cuando se demuestre que la porción de columna ubicada fuera del panel nodal
      permanece elástica, las alas de la columna en los nudos requieren soporte lateral sólo
      a nivel del ala superior de las vigas.

      Se acepta que la columna permanece elástica cuando la relación calculada usando la
      expresión (9-3), sea mayor que 2,0.

b)    Cuando una columna no permanece elástica fuera del panel nodal, se debe cumplir:

      1)    Las alas de la columna deberán estar soportadas lateralmente en los niveles
            superior e inferior de las alas de la viga.

      2)    Cada restricción lateral del ala de columna se diseñará para una resistencia
            requerida igual al 2 % de la resistencia nominal del ala de viga Fy bf tbf .

      3)    Las alas de la columna deberán estar, directa o indirectamente, soportadas
            lateralmente, a través del alma de la columna o alas de vigas perpendiculares al
            plano del pórtico.


<a id="c9.6.2"></a>
### 9.6.2 Nudos no restringidos  <sub>p.47</sub>


Una columna que contiene un nudo viga-columna sin apoyo lateral transversal al plano del
pórtico, deberá diseñarse considerando la distancia entre los apoyos laterales adyacentes
como altura de la columna, para la verificación del pandeo transversal al plano del pórtico.
Además, dicha columna deberá cumplir con las especificaciones del Capítulo H del
Reglamento CIRSOC 301-2005, excepto que:

     a)    La resistencia requerida de la columna se determine por la combinación de carga
           (A.4.5) del CIRSOC 301-2005, donde la acción sísmica E se toma igual al menor
           de los siguientes valores:

           1)   La fuerza sísmica amplificada Ω0 EH

           2)   1,25 de la resistencia de diseño del pórtico, determinada con la resistencia de
                diseño a flexión de las vigas, o con la resistencia de diseño al corte del panel
                nodal.

Reglamento INPRES-CIRSOC 103, Parte IV                                                Cap. 9 - 33


<!-- page 47 -->

   b)    La esbeltez L / r de la columna no sea mayor que 60.

   c)    La resistencia requerida a flexión transversal al plano del pórtico de la columna,
         incluya el momento originado por la aplicación de la fuerza en el ala de la viga,
         especificada en el artículo 9.6.1.b.2), más el momento de segundo orden debido al
         desplazamiento resultante del ala de la columna.


<a id="c9.7"></a>
### 9.7 APOYO LATERAL DE VIGAS  <sub>p.48</sub>


Ambas alas de una viga deberán apoyarse directa o indirectamente. La longitud no
soportada entre apoyos laterales no deberá ser mayor que: 17500 ry / Fy, (ry en mm, Fy en
MPa). Además, se deberán proveer apoyos laterales en las cercanías de fuerzas
concentradas, cambios en la sección transversal y en otras ubicaciones donde el análisis
indique que se formará una rótula plástica durante el desarrollo de deformaciones
inelásticas. Si se utilizan elementos con secciones reducidas de viga, ensayados de
acuerdo con lo especificado en el Apéndice, la ubicación del apoyo lateral para el
elemento deberá ser consistente con el utilizado en los ensayos.

Cualquier apoyo lateral adyacente a una sección reducida de viga deberá cumplir con lo
especificado en el artículo 15.5.


<!-- page 48 -->

CAPÍTULO 10. PÓRTICOS SISMORRESISTENTES                                                  NO
             ARRIOSTRADOS INTERMEDIOS


<a id="c10.1"></a>
### 10.1 INTRODUCCIÓN  <sub>p.49</sub>


Se espera que los pórticos sismorresistentes no arriostrados intermedios, definidos en el
artículo 3.4.a), soporten deformaciones inelásticas limitadas en sus miembros y uniones
cuando se encuentre sometidos a las fuerzas resultantes del terremoto de diseño. Los
pórticos no arriostrados intermedios deberán cumplir con los requerimientos establecidos
en este Capítulo.

Estos pórticos deberán diseñarse de manera que las deformaciones inelásticas inducidas
se logren:

   a)   Por fluencia de los elementos del pórtico (para el caso de uniones rígidas).

   b)   Por fluencia de los elementos de unión (para el caso de uniones semirígidas).

Las uniones rígidas y semirígidas se describen en el artículo A.2-2 del Reglamento
CIRSOC 301-2005.

Los pórticos sismorresistentes no arriostrados intermedios deberán cumplir con los
requerimientos especificados para los pórticos sismorresistentes no arriostrados
especiales establecidos en el Capítulo 9, con las modificaciones siguientes:

Reemplazar el artículo 9.2.a) por el 10.2.a), como sigue:


<a id="c10.2"></a>
### 10.2 NUDOS VIGA-COLUMNA Y UNIONES  <sub>p.49</sub>


a) El diseño de todos los nudos viga-columna y sus uniones usados en el sistema
   sismorresistente deberán basarse en resultados de ensayos cíclicos de habilitación de
   acuerdo con lo especificado en el Apéndice, que demuestren una distorsión lateral de
   piso de al menos 0,02 radianes. Los ensayos cíclicos de habilitación deberán consistir
   en al menos dos ensayos cíclicos y cumplir con los requerimientos especificados en el
   artículo 9.2.a).

b) Los ensayos de uniones viga-columna deberán demostrar una resistencia a flexión en
   la cara de la columna que sea al menos igual al momento plástico nominal de la viga
   Mp a la rotación inelástica requerida (ver Apéndice), excepto en los casos siguientes.


<a id="c1"></a>
### 1 La resistencia a flexión deberá tomarse como 0,8 Mp de la viga ensayada cuando  <sub>p.49</sub>

       el pandeo local de la viga en vez de la fluencia de la viga limite su resistencia
       flexional o cuando se usen uniones que incorporen una sección reducida en la viga.

Reglamento INPRES-CIRSOC 103, Parte IV                                             Cap. 10 - 35


<!-- page 49 -->


<a id="c2"></a>
### 2 Se permiten uniones que acomoden las rotaciones requeridas dentro sus  <sub>p.50</sub>

        elementos y mantengan la resistencia de diseño como se especifica, si puede
        demostrarse por medio de un análisis racional que cualquier distorsión lateral
        adicional debida a la deformación de la unión pueda acomodarse en el edificio. Tal
        análisis racional deberá incluir los efectos de la estabilidad global del pórtico
        incluyendo los efectos de segundo orden.


<a id="c3"></a>
### 3 La resistencia al corte requerida Vu de una unión viga-columna deberá  <sub>p.50</sub>

        determinarse usando la combinación de carga 1,2D + 0,5L + 0,2S más el corte
        resultante de la aplicación de un momento de magnitud igual a 1,1 Ry Fy Z de
        sentido opuesto en cada extremo de la viga. Se permite alternativamente un valor
        menor de Vu si se justifica por un análisis racional. No se necesita que la
        resistencia al corte requerida supere el corte resultante de la Combinación de
        Carga dada en la expresión (5-3).

c)   Deberán proveerse placas de continuidad consistentes con las uniones ensayadas.


<a id="c10.3"></a>
### 10.3 PANEL NODAL  <sub>p.50</sub>


Ver el artículo 9.3.


<a id="c10.4"></a>
### 10.4 LIMITACIONES DIMENSIONALES DE VIGAS Y COLUMNAS  <sub>p.50</sub>


Ver el artículo 9.4.

Reemplazar el artículo 9.4.2 por el 10.4.2, como sigue:


<a id="c10.4.2"></a>
### 10.4.2 Relación ancho-espesor  <sub>p.50</sub>


Las vigas deberán cumplir con los valores de λp establecidos en la Tabla B.5.1 del

Cuando la relación establecida en la expresión (9-3), sea menor o igual a 1,25 las
columnas deberán cumplir con los valores de λp establecidos en la Tabla 9.1.

Cuando la expresión (9-3), sea mayor que 1,25 las columnas deben cumplir con los
valores de λp especificados en la Tabla B.5.1 del Reglamento CIRSOC 301-2005.


<a id="c10.5"></a>
### 10.5 RELACIÓN ENTRE LAS RESISTENCIAS A FLEXIÓN DE VIGAS Y  <sub>p.50</sub>

      COLUMNAS

Ver el artículo 9.5.


<a id="c10.6"></a>
### 10.6 RESTRICCIÓN LATERAL DE NUDOS COLUMNA  <sub>p.50</sub>


Ver el artículo 9.6.


<!-- page 50 -->

Reemplazar el artículo 9.7 por el 10.7, como sigue:


<a id="c10.7"></a>
### 10.7 APOYO LATERAL DE VIGAS  <sub>p.51</sub>


Ambas alas de una viga deberán apoyarse directa o indirectamente. La longitud no
soportada entre apoyos laterales no deberá ser mayor que: 25200 ry / Fy, (ry en mm, Fy en
MPa). Además, se deberán proveer apoyos laterales en las cercanías de fuerzas
concentradas, cambios en la sección transversal y en otras ubicaciones donde el análisis
indique que se formará una rótula plástica durante el desarrollo de deformaciones
inelásticas.

Reglamento INPRES-CIRSOC 103, Parte IV                                         Cap. 10 - 37


<!-- page 51 -->



<!-- page 52 -->
