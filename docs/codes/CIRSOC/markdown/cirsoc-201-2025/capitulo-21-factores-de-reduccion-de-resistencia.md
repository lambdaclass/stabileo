# CIRSOC 201 (2025) — CAPÍTULO 21. FACTORES DE REDUCCIÓN DE RESISTENCIA

> Source: `CIRSOC 201-2025.pdf` · PDF pages 397–402
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c21.1"></a>
### 21.1 ALCANCE                                                   C 21.1. ALCANCE  <sub>p.397</sub>



<a id="c21.1.1"></a>
### 21.1.1 Este capítulo aplica a la selección de los              C 21.1.1. Los propósitos de los factores de reducción de  <sub>p.397</sub>

factores de reducción de resistencia usados en el               resistencia  son:
dimensionamiento, excepto en lo que se permite en
el Capítulo 27.                                                 (1) tener en cuenta la probabilidad de existencia de
                                                                    elementos con una resistencia baja debida a
                                                                    variaciones en la resistencia de los materiales y las
                                                                    dimensiones,

                                                                (2) tener en cuenta inexactitudes en las ecuaciones de
                                                                    cálculo,

                                                                (3) reflejar la ductilidad disponible y la confiabilidad
                                                                    requerida para el elemento sometido a los efectos de
                                                                    carga en consideración, y

                                                                (4) reflejar la importancia del elemento en la estructura
                                                                    (MacGregor, 1976; Winter, 1979).

21.2...FACTORES DE REDUCCIÓN DE RESIS-                          C.21.2...FACTORES DE REDUCCIÓN DE RESIS-
       TENCIA PARA ELEMENTOS DE HORMIGÓN                                 TENCIA PARA ELEMENTOS DE HORMI-
       ESTRUCTURAL Y CONEXIONES                                          GÓN ESTRUCTURAL Y CONEXIONES


<a id="c21.2.1"></a>
### 21.2.1 Los factores de reducción de resistencia,  ,           C 21.2.1. En este Reglamento, los factores de reducción de  <sub>p.397</sub>

deben cumplir con la Tabla 21.2.1, excepto lo                   resistencia son compatibles con las combinaciones de
modificado por los artículos 21.2.2, 21.2.3 y 21.2.4.           carga del ASCE/SEI 7-10, cuyo texto se ha adaptado para
                                                                el desarrollo del Reglamento CIRSOC 101-25 y
                                                                Reglamento CIRSOC 102-25, las cuales forman la base
                                                                para las combinaciones de mayoración de carga requeridas
                                                                por el Capítulo 5.

                                                                (e) Los resultados experimentales sobre zonas de anclaje
                                                                    de postesado (Breen et al. 1994) reflejan una amplia
                                                                    dispersión de resultados. Estos resultados se
                                                                    consideran usando un factor  igual a 0,85 y limitando
                                                                    la resistencia nominal a compresión del hormigón no
                                                                    confinado en la zona general a 0,7f´ci en el artículo
                                                                    25.9.4.5.2, donde  se define en el artículo 19.2.4. En
                                                                    consecuencia, la resistencia efectiva de cálculo para
                                                                    hormigón no confinado es 0,85×0,7f´ci = 0,6f´ci
                                                                    en la zona general.

                                                                (f) El comportamiento de la ménsulas cortas es
                                                                    controlado principalmente por corte; por lo tanto, se
                                                                    usa un solo valor de  = 0,75 para todos los modos
                                                                    potenciales de falla.

                                                                (i)   El factor de resistencia,  , para los elementos de
                                                                      hormigón simple se ha hecho igual para todos los
                                                                      modos de falla potenciales. Dado que tanto la
                                                                      resistencia a tracción por flexión como la resistencia a
                                                                      corte para el hormigón simple dependen de las
                                                                      características de resistencia a tracción del hormigón,
                                                                      sin una reserva de resistencia o ductilidad por la
                                                                      ausencia de la armadura, se ha considerado apropiado
                                                                      usar factores de reducción de la resistencia iguales
                                                                      tanto para flexión como para   corte.


<!-- page 397 -->

                       REGLAMENTO                                                 COMENTARIO

Tabla 21.2.1. Factores de reducción de resistencia, 

          Acción o Elemento estructural                                               Excepciones

                                                            0,65 a          Cerca de los extremos de elementos
       Momento, fuerza axial o momento y fuerza axial        0,90           pretesados donde los cordones no se han
 (a)
       combinados                                       de acuerdo con      anclado totalmente,  debe cumplir con
                                                            21.2.2          21.2.3.

                                                                            Se presentan requisitos adicionales en 21.2.4
 (b)   Corte                                                  0,75          para estructuras proyectadas para resistir
                                                                            efectos sísmicos.
 (c)   Torsión                                                0,75                                —
 (d)   Aplastamiento                                          0,65                                —
 (e)   Zonas de anclajes de postesado                         0,85                                —
 (f)   Ménsulas cortas                                        0,75                                —
       Puntales, tensores, zonas nodales y áreas de
 (g)   apoyo dimensionadas de acuerdo con el método           0,75                                —
       puntal-tensor del Capítulo 23
       Componentes de conexiones de elementos
 (h)   prefabricados controlados por fluencia de              0,90                                —
       elementos de acero a tracción
 (i)   Elementos de hormigón simple                           0,60                                —
                                                           0,45 a 0,75
 (j)   Anclajes en elementos de hormigón                de acuerdo con el                         —
                                                           Capítulo 17


<a id="c21.2.2"></a>
### 21.2.2 El factor de reducción de resistencia para          C 21.2.2. La resistencia nominal de un elemento sometido  <sub>p.398</sub>

momento, fuerza axial o momento y fuerza axial              a momento, fuerza axial o a una combinación de fuerza
combinados debe ser el dado por la Tabla 21.2.2.            axial y momento se alcanza cuando la deformación
                                                            específica en la fibra extrema en compresión es igual al
                                                            límite de deformación específica supuesto de 0,003. La
                                                            deformación neta de tracción, t , es la deformación
                                                            específica de tracción calculada en la armadura
                                                            longitudinal más traccionada en el estado de resistencia
                                                            nominal, sin considerar las deformaciones específicas
                                                            debidas al pretensado, fluencia lenta, contracción y
                                                            temperatura. La deformación específica neta de tracción en
                                                            la armadura longitudinal más traccionada se determina a
                                                            partir de una distribución de deformaciones específicas
                                                            lineal en el estado de resistencia nominal, como se aprecia
                                                            en la Figura C 21.2.2a para un elemento no pretensado.

                                                            Los elementos sometidos solamente a compresión axial se
                                                            consideran controlados por compresión y los elementos
                                                            sometidos solamente a tracción axial se consideran
                                                            controlados por tracción.

                                                            Cuando la deformación unitaria neta de tracción de la
                                                            armadura longitudinal más traccionada es suficientemente
                                                            grande (≥ ty + 0,003), la sección se define como controla-
                                                            da por tracción, para la cual se puede esperar una clara
                                                            advertencia previa de falla con flechas y fisuración
                                                            excesivas. El límite de (≥ ty + 0,003) provee suficiente
                                                            ductilidad en la mayoría de los casos. En la versión
                                                            anterior del presente Reglamento, el límite del
                                                            comportamiento controlado por tracción estaba definido
                                                            como t = 0,005, establecido primariamente con base en
                                                            armaduras pasivas con fy = 420 MPa y armaduras preten-

Reglamento CIRSOC 201-25                                                                                       Cap. 21 - 366


<!-- page 398 -->

                    REGLAMENTO                                                      COMENTARIO

                                                                sadas, con algunas consideraciones basadas en armaduras
                                                                pasivas con resistencias mayores (Mast 1992). A partir del
                                                                presente Reglamento, para tener en cuenta armaduras
                                                                pasivas de mayor resistencia, el límite de comportamiento
                                                                controlado por tracción de t en la Tabla 21.2.2 se define
                                                                como ty + 0,003. Esta expresión es congruente con la
                                                                recomendación de Mast (1992) para el caso general de
                                                                armaduras con resistencias diferentes a 420 MPa, y
                                                                resultados de ensayos que muestran que la expresión
                                                                conduce a elementos con ductilidad adecuada.

                                                                Una condición donde se requiere una ductilidad mayor
                                                                corresponde a la redistribución de momentos en elementos
                                                                continuos y pórticos, la cual está cubierta en el artículo
                                                                6.6.5. Dado que la redistribución de momentos depende de
                                                                la ductilidad disponible en las zonas de articulación
                                                                plástica, la redistribución de momentos se limita a
                                                                secciones que tengan una deformación específica neta de
                                                                tracción de al menos 0,0075.

                                                                Cuando la deformación específica neta de tracción en la
                                                                armadura longitudinal más traccionada es pequeña (≤ ty),
                                                                se puede esperar una condición de falla frágil por
                                                                compresión, sin advertencia clara de una falla inminente.
                                                                Con anterioridad, en el documento CIRSOC 201-05, el
                                                                límite de deformación unitaria controlada por compresión
                                                                se definía como 0,002 para armaduras con fy = 420 MPa
                                                                y todas las armaduras pretensadas, pero no estaba definido
                                                                explícitamente para otros tipos de armaduras. El límite de
                                                                deformación específica controlado por compresión, ty , se
                                                                define en los artículos 21.2.2.1 y 21.2.2.2 para las
                                                                armaduras pasivas conformadas y pretensadas, respectiva-
                                                                mente.

                                                                Normalmente las vigas y losas están controladas por
                                                                tracción, en cambio las columnas pueden estar controladas
                                                                por compresión. Algunos elementos, como aquellos con
                                                                carga axial pequeña y momento a flexión grande, tienden a
                                                                tener deformaciones específicas netas de tracción en la
                                                                armadura más traccionada dentro de los límites de ty y
                                                                (ty + 0,003). Estas secciones se encuentran en una región
                                                                de transición entre las secciones controladas por
                                                                compresión y las controladas por tracción.

                                                                Esta sección prescribe los factores de reducción de
                                                                resistencia aplicables a las secciones controladas por
                                                                tracción y las secciones controladas por compresión, y para
                                                                los casos intermedios en las regiones de transición. La
                                                                expresión (ty + 0,003) define en la Tabla 21.2.2 el límite
                                                                para t para comportamiento controlado por tracción.
                                                                Para las secciones sometidas a combinación de fuerza axial
                                                                y momento, las resistencias de cálculo se determinan
                                                                multiplicando tanto Pn como Mn por el valor único
                                                                apropiado de .

                                                                Para las secciones controladas por compresión, se usa un
                                                                factor  menor que para las secciones controladas por
                                                                tracción porque las secciones controladas por compresión
                                                                tienen menor ductilidad, son más sensibles a las
                                                                variaciones en la resistencia del hormigón y generalmente


<!-- page 399 -->

                           REGLAMENTO                                                             COMENTARIO

                                                                         se presentan en elementos que soportan áreas cargadas
                                                                         mayores que los elementos con secciones controladas por
                                                                         tracción. A las columnas con zuncho en espiral se les
                                                                         asigna un factor  mayor que a las columnas con otro tipo
                                                                         de armadura transversal porque las columnas con zunchos
                                                                         en espiral tienen mayor ductilidad y tenacidad. Para las
                                                                         secciones que se encuentran dentro de la región de
                                                                         transición, el valor de  puede ser determinado por interpo-
                                                                         lación lineal, como se aprecia en la Figura C 21.2.2b.


<a id="c21.2.2.1"></a>
### 21.2.2.1 Para armaduras pasivas conformadas, ty  <sub>p.400</sub>

debe ser igual a fy / Es . Para armaduras pasivas con-
formadas con fy = 420 MPa, se permite tomar ty
igual a 0,002.


<a id="c21.2.2.2"></a>
### 21.2.2.2 Para las armaduras pretensadas, ty debe  <sub>p.400</sub>

tomarse como 0,002.

Tabla 21.2.2. Factor de reducción de resistencia,  , para momento, fuerza axial, o combinación de
momento y fuerza axial

                                                                                              
     Deformación
   específica neta de          Clasificación                                   Tipo de armadura transversal
      tracción, t                                       Zunchos en espiral que
                                                                                                                   Otro
                                                           cumplen con 25.7.3
                                Controlada por
            t ≤ ty                                             0,75                   (a)                 0,65                      (b)
                                 compresión
                                                                        (t - ty)                                 (t - ty)
    ty < t < ty + 0,003       Transición[1]            0,75 + 0,15                   (c)          0,65 + 0,25                      (d)
                                                                        (0,003)                                    (0,003)
                                Controlada por
        t ≥ ty + 0,003                                         0,90                   (e)                 0,90                      (f)
                                   tracción
  [1]
         Para las secciones clasificadas como de transición, se permite usar el valor de  correspondiente a secciones controladas
         por compresión.

                                                                         Figura C 21.2.2a. Distribución de deformaciones especí-
                                                                         ficas y deformación específica neta de tracción en un
                                                                         elemento no pretensado.

Reglamento CIRSOC 201-25                                                                                                        Cap. 21 - 368


<!-- page 400 -->

                    REGLAMENTO                                                        COMENTARIO

                                                                Figura C 21.2.2b. Variación de  con la deformación
                                                                específica neta de tracción en el acero extremo a tracción
                                                                t .


<a id="c21.2.3"></a>
### 21.2.3 Para secciones en elementos flexionados                 C 21.2.3. Si se presenta una sección crítica de un elemento  <sub>p.401</sub>

pretesados donde no todos los cordones están                    pretesado en una zona donde no todos los cordones se han
anclados completamente (distancia al extremo del                anclado completamente, la falla puede ocurrir por
elemento menor que la longitud de anclaje),  para              adherencia. Ese tipo de falla se asemeja a una falla frágil
momento debe calcularse de acuerdo con la Tabla                 por corte, de ahí la exigencia de un valor  reducido para
21.2.3, donde tr se calcula con la ecuación (21.2.3),          flexión con respecto al valor de  de una sección donde
donde p es el valor de  determinado de acuerdo                todos los cordones se han anclado completamente. Para las
                                                                secciones que se encuentran entre el final de la longitud de
con la Tabla 21.2.2 en la sección transversal más
                                                                transferencia y el final de la longitud de anclaje, el valor de
cercana al extremo del elemento donde todos los
                                                                 puede ser determinado por interpolación lineal, como se
cordones están anclados y d se obtiene de acuerdo
                                                                muestra en la Figura C 21.2.3a, donde p corresponde al
con el artículo 25.4.8.1.
                                                                valor de  en la sección transversal más cercana al extremo
                       f                                        del elemento donde todos los cordones están totalmente
                tr = ( se ) db                 (21.2.3)        anclados.
                       21
                                                                Cuando la adherencia de uno o más cordones no se
                                                                extienda hasta el extremo del elemento, en vez de un
                                                                análisis más riguroso,  debería tomarse como 0,75 desde
                                                                el extremo del elemento hasta el extremo de la longitud de
                                                                transferencia del cordón teniendo en cuenta la mayor
                                                                longitud no adherida. Más allá de este punto,  puede
                                                                variar de manera lineal a p en la sección transversal
                                                                donde se han anclado todos los cordones, como se muestra
                                                                en la Figura C 21.2.3b. Alternativamente, el valor de 
                                                                puede tomarse como 0,75 hasta llegar al punto donde todos
                                                                los cordones están completamente anclados. Se considera
                                                                que el embebido del cordón no adherido se inicia en el
                                                                punto donde terminan las vainas que inhiben la adherencia.
                                                                Más allá de ese punto, las disposiciones del artículo
                                                                25.4.8.1 se usan para determinar si los cordones se anclan
                                                                en una longitud d ó 2d dependiendo de la tensión
                                                                calculada en la zona de tracción precomprimida bajo
                                                                cargas de servicio (Figura C 21.2.3b).


<!-- page 401 -->

                         REGLAMENTO                                                                COMENTARIO

Tabla 21.2.3. Factor de reducción de resistencia,  , para secciones cercanas al extremo de elementos
pretesados

   Condición
                        Tensión en el           Distancia desde el extremo
   cercana al
                       hormigón bajo               del elemento hasta la                                         
  extremo del
                     carga de servicio [1]      sección en consideración
   elemento
       Todos los                                              ≤ tr                                   0,75                          (a)
       cordones             No aplica
                                                                                                                            [2]
       adheridos                                           tr a d                  Interpolación lineal entre 0,75 y p           (b)

                     Los cálculos no indican             ≤ (db + tr)                                0,75                          (c)
   Uno o más                tracción
  cordones con                                      (db + tr) a (db + d)         Interpolación lineal entre 0,75 y p [2]       (d)
   adherencia                                             ≤ (db + tr)                               0,75                          (e)
     inhibida         Los cálculos indican
                            tracción               (db + tr) a (db + 2d)         Interpolación lineal entre 0,75 y p   [2]
                                                                                                                                    (f)
 [1]
         La tensión calculada en la fibra extrema de hormigón de la zona de tracción precomprimida bajo cargas de servicio después del ajuste
         debido a todas las pérdidas de pretensado en la sección en consideración, usando las propiedades de la sección transversal bruta.
 [2]     Se permite usar un factor de reducción de resistencia de 0,75.

                                                                           Figura C 21.2.3a. Variación de  con la distancia desde
                                                                           el extremo libre del cordón en elementos pretesados con
                                                                           cordones completamente adheridos.

                                                                           Figura C 21.2.3b. Variación de  con la distancia desde
                                                                           el extremo libre del cordón en elementos pretesados con
                                                                           cordones con adherencia inhibida.


<a id="c21.2.4"></a>
### 21.2.4 Para elementos sismorresistentes el valor del  <sub>p.402</sub>

factor de minoración de resistencia  se establece
en INPRES-CIRSOC 103 - Parte II - 2026.

Reglamento CIRSOC 201-25                                                                                                          Cap. 21 - 370


<!-- page 402 -->

                    REGLAMENTO                                                       COMENTARIO
