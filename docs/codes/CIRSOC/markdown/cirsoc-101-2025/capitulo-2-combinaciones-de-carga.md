# CIRSOC 101 (2025) — CAPÍTULO 2. COMBINACIONES DE CARGA

> Source: `CIRSOC 101-2025.pdf` · PDF pages 49–64
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c2.1"></a>
### 2.1 GENERALIDADES                                     C 2.1. GENERALIDADES  <sub>p.49</sub>


Los edificios y otras estructuras se deberán diseñar   Las cargas especificadas en este Reglamento y en los
utilizando las combinaciones de carga establecidas     demás Reglamentos CIRSOC e INPRES-CIRSOC,
en cada uno de los Reglamentos CIRSOC e                correspondientes a la tercera generación de Reglamentos
INPRES-CIRSOC desarrollados para cada material.        de Seguridad Estructural están diseñadas para ser
Dichas combinaciones de carga tendrán                  utilizadas con especificaciones de diseño que proporcionan
prelación con respecto a las combinaciones             factores de carga y resistencia para materiales estructurales
generales especificadas en el artículo 2.3.            convencionales, incluidos acero, hormigón, mampostería,
                                                       madera y aluminio.

                                                       Los factores de carga proporcionados en este Reglamento
                                                       y en ASCE 7-2010, se han desarrollado utilizando un
                                                       análisis probabilístico de primer orden y un estudio amplio
                                                       de las fiabilidades inherentes a la práctica del diseño
                                                       contemporáneo (Ellingwood et al. (1982), Galambos et al.
                                                       (1982)).

                                                       Estos factores de carga son utilizados por todos los
                                                       Reglamentos CIRSOC e INPRES-CIRSOC, basados en
                                                       materiales que adoptan una filosofía de diseño por
                                                       resistencia, en conjunto con resistencias nominales y
                                                       factores de resistencia, que han sido desarrollados por
                                                       distintos equipos de investigación para especificaciones de
                                                       materiales individuales en documentos como el ASCE 7-
                                                       2010 - Minimum Design Loads for Buildings and Other
                                                       Structures.

                                                       En la bibliografía se puede consultar la publicación de
                                                       Ellingwood y colaboradores (1982) que también propor-
                                                       ciona pautas para equipos de investigación de especifica-
                                                       ciones de materiales, con el fin de ayudarlos a desarrollar
                                                       factores de resistencia que sean compatibles, en términos
                                                       de fiabilidad intrínseca, con factores de carga e informa-
                                                       ción estadística específica para cada material estructural.

                                                       El requisito de utilizar un diseño por factores de carga y
                                                       resistencia (LRFD) se remonta a la introducción de
                                                       combinaciones de carga para el diseño por resistencia
                                                       (LRFD) en la edición 1982 de ASCE 7.

                                                       Los Reglamentos CIRSOC e INPRES-CIRSOC contem-
                                                       plan el diseño por factores de carga y resistencia, tanto
                                                       en su segunda generación (2005 en adelante) como en
                                                       esta tercera generación (2018 en adelante).

                                                       Es importante resaltar que este Reglamento no permite la
                                                       combinación indiscriminada de los métodos LRFD y
                                                       ASD (Allowable Stress Design) porque la misma puede
                                                       conducir a un comportamiento impredecible del sistema
                                                       estructural, dado que los análisis de fiabilidad y las
                                                       calibraciones del código ASCE 7, que condujeron a las
                                                       combinaciones de carga LRFD, se desarrollaron en base
                                                       a estados límite de elementos estructurales en lugar de
                                                       estados límite de sistemas.

                                                       Sin embargo, las fundaciones de las estructuras se suelen
                                                       diseñar habitualmente con el método ASD, aunque se
                                                       utilice el diseño por resistencia para el resto de la

Reglamento CIRSOC 101-25                                                                                 Cap. 2 - 33


<!-- page 49 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   estructura. Esta situación tiene carácter transitorio hasta
                                                                   que se publique y consolide la utilización del método
                                                                   LRFD para el diseño de las fundaciones.


<a id="c2.2"></a>
### 2.2 SIMBOLOGÍA                                                    C 2.2. SIMBOLOGÍA  <sub>p.50</sub>


Ak         carga o efecto de carga que surge de un                 Las solicitaciones de coacción T pueden ser causadas por:
           evento extraordinario A.
                                                                   - el asentamiento diferencial de las fundaciones,
D          cargas permanentes o las solicitaciones
           correspondientes (cargas permanentes                    - fluencia lenta de los elementos de hormigón,
           debidas al peso de los elementos estructu-
           rales y de los elementos que actúan en                  - la retracción o contracción de los elementos estructurales
           forma permanente sobre la estructura).                    después de la colocación del hormigón,

Di         carga debida al peso del hielo.                         - la expansión del hormigón que compensa la retracción y

                                                                   - los cambios de temperatura en los elementos estructurales
E          cargas debidas al sismo.
                                                                     durante la vida útil de la estructura.
F          cargas debidas al peso y a la presión de
                                                                   En algunos casos, estas solicitaciones de coacción pueden
           fluidos con presiones bien definidas y
                                                                   demandar una consideración de diseño significativa.
           alturas máximas.
                                                                   Cuando las estructuras de hormigón o mampostería se
                                                                   fisuran se produce una reducción de la rigidez que puede
Fa         carga debida a inundación.                              aliviar las fuerzas de coacción, por lo que la evaluación de
                                                                   las cargas debería considerar esa rigidez reducida.
H          cargas debidas al peso y presión lateral del
           suelo, del agua en el suelo u otros mate-               Algunas cargas permanentes, como las cargas debidas al
           riales, o las solicitaciones correspondientes.          diseño paisajístico de jardines o zonas verdes en áreas de
                                                                   plazas, se pueden considerar más apropiadamente como
L          sobrecargas de diseño o las solicitaciones              sobrecargas a los fines del diseño.
           correspondientes (sobrecarga debida a la
           ocupación y a los equipos móviles).

Lr         sobrecargas en las cubiertas                o   las
           solicitaciones correspondientes.

R          carga debida a la lluvia, o las solicitaciones
           correspondientes.

S          carga debida a la nieve, o las solicitaciones
           correspondientes.

T          solicitaciones de coacción y efectos
           provenientes de la contracción o expansión
           resultante de las variaciones de tempera-
           tura, fluencia lenta de los materiales
           componentes, contracción, cambios de
           humedad y asentamientos diferenciales.

W          carga debida al viento o las solicitaciones
           correspondientes.

Wi         carga debida al viento sobre hielo
           determinada de acuerdo con el Reglamento
           CIRSOC 102.


<!-- page 50 -->

                      REGLAMENTO                                               COMENTARIO


<a id="c2.3"></a>
### 2.3 COMBINACIÓN DE CARGAS MAYORADAS                  C 2.3. COMBINACIÓN DE CARGAS MAYORADAS  <sub>p.51</sub>

         UTILIZANDO DISEÑO POR RESISTENCIA                       UTILIZANDO DISEÑO POR RESISTENCIA


<a id="c2.3.1"></a>
### 2.3.1 Campo de validez                                   C 2.3.1. Campo de validez  <sub>p.51</sub>


Las combinaciones de carga y los factores de              Los factores de carga y las combinaciones de carga dados
carga, dados en el artículo 2.3.2, serán utilizados       en este artículo se aplican a los estados límite o a los
solamente en aquellos casos en que estén                  criterios de diseño por resistencia (denominados “diseño de
específicamente autorizados por el Reglamento             factores de carga y resistencia”), y no se deben utilizar con
CIRSOC o INPRES-CIRSOC aplicable para cada                especificaciones de diseño por tensiones admisibles.
material.


<a id="c2.3.2"></a>
### 2.3.2 Combinaciones básicas                              C 2.3.2. Combinaciones básicas  <sub>p.51</sub>


Las estructuras, sus elementos componentes, y sus         Las cargas no mayoradas que se deberán utilizar con estos
fundaciones se deberán diseñar de manera que su           factores de carga son las cargas nominales especificadas
resistencia de diseño iguale o exceda los efectos de      en este Reglamento.
las cargas afectadas por factores que se detallan en
las siguientes combinaciones de carga:                    Los factores de carga son los determinados por Ellingwood
                                                          et al. (1982), con la excepción del factor 1,0 para E, que se
       1. 1,4 D                                           basa en la investigación más reciente de NEHRP sobre
                                                          diseño sismorresistente (FEMA 2004).
       2. 1,2 D + 1,6 L + 0,5 (Lr ó S ó R)
       3. 1,2 D + 1,6 (Lr ó S ó R) + (L ó 0,5 W)          La idea básica del análisis de la combinación de cargas es
                                                          que, además de la carga permanente, una de las cargas
       4. 1,2 D + 1,0 W + L + 0,5 (Lr ó S ó R)            variables adquirirá su valor máximo de vida útil mientras
                                                          las otras cargas variables asumirán “valores puntuales
       5. 1,2 D + 1,0 E + L + 0,2 S                       arbitrarios en el tiempo”, siendo estas últimas cargas las
       6. 0,9 D + 1,0 W                                   que se podrían medir en cualquier instante de tiempo
                                                          (Turkstra and Madsen, 1980).
       7. 0,9 D + 1,0 E
                                                          Esto es coherente con la forma en que las cargas se
Excepciones                                               combinan realmente en situaciones en las que se pueden
                                                          acercar a los estados límite de resistencia. Sin embargo, las

<a id="c1"></a>
### 1 El factor de carga L en las combinaciones 3,       cargas nominales dadas en ASCE 7 (y en este Reglamen-  <sub>p.51</sub>

       4, y 5 se permite que sea igual a 0,5 para todos   to), superan sustancialmente los valores arbitrarios en un
       los destinos de uso en los cuales Lo en la Tabla   momento determinado. Para evitar tener que especificar
       4.1 sea menor o igual que 5 kN/m2 con la           tanto un valor máximo como un valor puntual arbitrario
       excepción de garajes o áreas ocupadas como         para cada tipo de carga, algunos de los factores de carga
       lugares de reunión pública.                        especificados en las combinaciones de carga son menores
                                                          que la unidad en las combinaciones 2 a 6 especificadas en

<a id="c2"></a>
### 2 En las combinaciones 2, 4 y 5, la carga            el Reglamento.  <sub>p.51</sub>

       complementaria S se deberá considerar como
       la carga de nieve sobre una cubierta plana.        Los factores de carga especificados en el artículo 2.3.2 se
                                                          basan en una recopilación de datos sobre las fiabilidades
Cuando estén presentes las cargas debido a fluidos        inherentes a la práctica de diseño existente (Ellingwood et
F, se deberán incluir con el mismo factor de carga        al., 1982; y Galambos et al., 1982).
que la carga permanente D en las combinaciones
1 hasta 5 y 7.                                            El factor de carga sobre la carga de viento en las
                                                          combinaciones 4 y 6 se ha reducido de 1,6 (valor
Cuando la carga H esté presente, se deberá incluir        establecido en la especificación ASCE 7-05 adoptada de
de la siguiente forma:                                    base para desarrollar los Reglamentos CIRSOC 101-05 y
                                                          CIRSOC 102-05 vigentes) a 1,0 en ASCE 7-10. Esta

<a id="c1"></a>
### 1 Cuando el efecto de H se sume al efecto de         reducción se consideró necesaria debido a la modificación  <sub>p.51</sub>

       carga variable primario, se deberá incluir H con   de la velocidad del viento de diseño en el Capítulo 26 de
       un factor de carga de 1,6;                         ASCE 7-10. En la nueva versión del Reglamento CIRSOC
                                                          102-2025 (que se encuentra en desarrollo) se adoptará de

<a id="c2"></a>
### 2 Cuando el efecto de H se oponga al efecto de       base la versión ASCE 7-2010-2016.  <sub>p.51</sub>

       carga variable primario, se deberá incluir H con
       un factor de carga de 0,9 cuando la carga sea      Como se explica en el Comentario al Capítulo 26 de ASCE
       permanente o un factor de carga igual a 0 para     7-2010, la velocidad del viento se expresa actualmente en
       todas las demás condiciones.                       los mapas de Estados Unidos, para períodos de recurrencia

Reglamento CIRSOC 101-25                                                                                    Cap. 2 - 35


<!-- page 51 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   mucho más largos (700 a 1700 años, según la Categoría de
     Se deberán investigar los efectos de una o más                riesgo) que en ediciones anteriores.
     cargas que no estén actuando. Los efectos más
     desfavorables de las cargas debidas al viento y               Además se ha eliminado la discontinuidad existente entre
     a los sismos se deberán investigar cuando sea                 la calificación del riesgo para áreas costeras propensas a
     apropiado pero no será necesario considerar                   huracanes, y el resto del país, y se ha definido mejor el
     que actúan simultáneamente.                                   tratamiento de los efectos del viento y de los sismos.

     Se deberá investigar cada estado límite de                    La excepción (2) del Reglamento permite que la carga
     resistencia que resulte relevante.                            complementaria S, que aparece en las combinaciones (2),
                                                                   (4) y (5), sea la carga de nieve balanceada definida en las
                                                                   Secciones 7.3 de ASCE 7-2010 para cubiertas planas y en
                                                                   la Sección 7.4 para cubiertas inclinadas. En la
                                                                   combinación de carga (3) están comprendidas las cargas
                                                                   de nieve producidas por nieve en suspensión y por carga
                                                                   sin balancear cuando son consideradas como cargas
                                                                   principales.

                                                                   Las combinaciones de carga 6 y 7 se deben aplicar
                                                                   específicamente al caso en el que las acciones estructurales
                                                                   debidas a fuerzas laterales y cargas de gravedad se
                                                                   contrarresten entre sí.

                                                                   Los requisitos de combinación de cargas especificado en
                                                                   el artículo 2.3 se deben aplicar solo a los estados límite de
                                                                   resistencia. Los estados límite de servicio y los factores de
                                                                   carga asociados se consideran en el Apéndice C de ASCE
                                                                   7-2010.

                                                                   Históricamente, ASCE 7 ha proporcionado procedimientos
                                                                   específicos para determinar las magnitudes de las cargas
                                                                   permanentes, las sobrecargas debidas a la ocupación y al
                                                                   uso, y las debidas a la acción del viento, la nieve y los
                                                                   sismos.

                                                                   Otras cargas, que tradicionalmente no han sido
                                                                   contempladas por dicho documento, pueden requerir
                                                                   también ser consideradas en el diseño. Algunas de esas
                                                                   cargas pueden ser importantes en ciertas especificaciones
                                                                   de materiales y se deben incluir en los criterios de carga
                                                                   para permitir que se logre uniformidad en los criterios de
                                                                   carga para diferentes materiales.

                                                                   Sin embargo, los datos estadísticos sobre estas cargas son
                                                                   limitados o inexistentes, por lo que no se pueden aplicar
                                                                   actualmente los mismos procedimientos utilizados para
                                                                   obtener los factores de carga y combinaciones de carga
                                                                   especificados en el artículo 2.3.2.

                                                                   En consecuencia, los factores de carga para la carga debida
                                                                   al peso y presión de los fluidos, (F), y para la carga debida
                                                                   al peso y presión lateral del suelo, y del agua en el suelo
                                                                   (H), han sido elegidos para producir diseños que serían
                                                                   similares a los obtenidos con las especificaciones
                                                                   existentes, siempre que a los factores de resistencia se le
                                                                   realicen los ajustes apropiados y coherentes con las
                                                                   combinaciones de carga dadas en el artículo 2.3.2. Aún se
                                                                   necesitan más investigaciones para desarrollar factores de
                                                                   carga más precisos.

                                                                   La carga debida al peso y a la presión de los fluidos, F,
                                                                   define acciones estructurales en soportes estructurales,
                                                                   pórticos o fundaciones de un tanque de almacenamiento,


<!-- page 52 -->

                   REGLAMENTO                        COMENTARIO

                                depósito, cisterna, o recipiente contenedor similar, debido
                                a los productos líquidos almacenados. El producto
                                almacenado o guardado en un tanque de almacenamiento
                                comparte características de carga permanente y sobrecarga.
                                Es similar a una carga permanente dado que su peso tiene
                                un valor máximo calculado y la magnitud de la carga real
                                puede tener una dispersión relativamente pequeña. Sin
                                embargo, no es permanente dado que el vaciado y el
                                llenado provocan fuerzas fluctuantes en la estructura. La
                                carga máxima puede ser excedida por sobrellenado; y las
                                densidades de los productos almacenados en un tanque
                                específico pueden variar.

                                La carga debida al peso y presión de los fluidos, F, se
                                incluye en las combinaciones de carga cuando sus efectos
                                son aditivos a las otras cargas (combinaciones de carga
                                1 a 5).

                                Cuando la carga F actúe como una resistencia a las fuerzas
                                de elevación, se debería incluir en la carga permanente D.
                                La masa del fluido se incluye en el efecto inercial debido a
                                E (ver Sección 15.4.3 de ASCE 7-2010) y en la
                                determinación del corte base para tanques (ver Sección
                                15.7 de ASCE 7-2010). El corte base es la fuerza de
                                deslizamiento que se genera en la base de la estructura
                                debido a las fuerzas sísmicas.

                                Para dejar en claro que el peso del fluido en un tanque se
                                puede usar para resistir el levantamiento, la carga F se
                                agregó a la combinación de carga 7, donde se considerará
                                como carga permanente sólo cuando F contrarreste a E.

                                Los efectos de la masa del fluido sobre la estabilización
                                dependerán del grado de llenado del tanque. La carga F no
                                se incluye en la combinación 6 porque la carga de viento
                                puede estar presente ya sea que el tanque esté lleno o
                                vacío, por lo que el caso de carga gobernante en la
                                combinación 6 será cuando F sea igual a cero.

                                Las incertidumbres en las fuerzas laterales del material a
                                granel, incluidas en la carga H, son mayores que las de los
                                fluidos, particularmente cuando se introducen efectos
                                dinámicos en el momento en que el material a granel se
                                pone en movimiento mediante operaciones de llenado o
                                vaciado. En consecuencia, el factor de carga para tales
                                cargas se ha especificado en 1,6.

                                Cuando H actúe como una resistencia, se sugiere utilizar
                                un factor de 0,9 si la resistencia pasiva se calcula con un
                                sesgo conservador. La intención es que la resistencia del
                                suelo se calcule para un límite de deformación apropiado
                                para la estructura que se está diseñando, no para la
                                resistencia pasiva última. Por lo tanto, una presión lateral
                                en reposo, como se define en la literatura técnica, sería lo
                                suficientemente conservadora. Son posibles resistencias
                                más grandes que la presión lateral en reposo, dadas las
                                condiciones adecuadas del suelo.

                                La resistencia completamente pasiva probablemente nunca
                                sería apropiada porque las deformaciones necesarias en el
                                suelo probablemente serían tan grandes que la estructura se
                                vería comprometida. Además, existe una gran incertidum-
                                bre en el valor nominal de la resistencia pasiva, lo que

Reglamento CIRSOC 101-25                                                          Cap. 2 - 37


<!-- page 53 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   también podría argumentar a favor de un factor más bajo
                                                                   de H, en caso de que no se incluya un sesgo conservador.


<a id="c2.3.3"></a>
### 2.3.3 Combinaciones de carga incluyendo las                       C 2.3.3. Combinaciones de carga incluyendo las  <sub>p.54</sub>

       cargas debidas a hielo atmosférico                                   cargas debidas a hielo atmosférico

Cuando una estructura esté sujeta a la acción de                   Las combinaciones de carga 1 y 2 especificadas en el
cargas debidas al hielo atmosférico y viento sobre el              artículo 2.3.3 incluyen los efectos simultáneos de las
hielo, se deberán considerar las siguientes                        cargas de nieve (como se definen en el Reglamento
combinaciones de cargas:                                           CIRSOC 104-05 y en el Capítulo 7 de ASCE 7-2010) y de
                                                                   las cargas debidas al hielo atmosférico como se definen

<a id="c1"></a>
### 1 En la combinación 2: se deberá reemplazar                     en el Reglamento CIRSOC 104 y en el Capítulo 10 de  <sub>p.54</sub>

                                                                   ASCE 7-2010).
              0,5 (Lr ó S ó R) por 0,2 Di + 0,5 S
                                                                   Las combinaciones de carga 2 y 3 especificadas en el

<a id="c2"></a>
### 2 En la combinación 4: se deberá reemplazar                     artículo 2.3.3 introducen el efecto simultáneo del viento  <sub>p.54</sub>

                                                                   sobre el hielo atmosférico.
     1,0 W + 0,5 (Lr ó S ó R) por 0,2 Di + Wi + 0,5 S
                                                                   La carga de viento sobre el hielo atmosférico, Wi , corres-

<a id="c3"></a>
### 3 En la combinación 6: se deberá reemplazar                     ponde a un evento con un intervalo de recurrencia medio  <sub>p.54</sub>

                                                                   (Mean Recurrence Interval - MRI) de aproximadamente
                        1,0 W por Di + Wi                          500 años. En consecuencia, los factores de carga para Wi
                                                                   se establecieron en 1,0 en el artículo 2.3.4.

                                                                   Las cargas de nieve definidas en el Reglamento CIRSOC
                                                                   104-05 y en el Capítulo 7 de ASCE 7-2010 se basan en
                                                                   mediciones de precipitación congelada acumulada en el
                                                                   suelo, que incluye nieve, hielo debido a lluvia helada y
                                                                   lluvia que cae sobre la nieve y luego se congela. Por lo
                                                                   tanto, los efectos de la lluvia helada se incluyen en las
                                                                   cargas de nieve para cubiertas, techos, pasarelas y otras
                                                                   superficies a las que normalmente se aplican las cargas de
                                                                   nieve.

                                                                   Las cargas debidas al hielo atmosférico definidas en el
                                                                   Capítulo 10 de ASCE 7-2010, se deben aplicar
                                                                   simultáneamente a aquellas partes de la estructura en las
                                                                   cuales se acumule hielo debido a la lluvia helada, a la
                                                                   formación de hielo en las nubes o a la acumulación de
                                                                   nieve y que no están sujetas a las cargas de nieve del
                                                                   Capítulo 7 de ASCE 7-2010. Una torre reticulada instalada
                                                                   en el techo de un edificio es un ejemplo. Las cargas de
                                                                   nieve dadas en el Capítulo 7 de ASCE 7 se aplicarían al
                                                                   techo con las cargas de hielo atmosférico del Capítulo 10
                                                                   aplicadas a la torre reticulada. Si una torre reticulada tiene
                                                                   plataformas de trabajo, las cargas de nieve se aplicarían a
                                                                   la superficie de las plataformas con las cargas de hielo
                                                                   atmosférico aplicadas a la torre. Si un letrero está montado
                                                                   en un techo, las cargas de nieve se aplicarían al techo y las
                                                                   cargas de hielo atmosférico al letrero.


<a id="c2.3.4"></a>
### 2.3.4 Combinaciones de carga                   incluyendo         C 2.3.4. Combinaciones de carga incluyendo las  <sub>p.54</sub>

       cargas debidas a coacción                                            cargas debidas a coacción

Cuando sea aplicable, los efectos estructurales de la              Los efectos de la carga de coacción se deberían calcular
carga de coacción T (esfuerzos internos debidos a                  sobre la base de una evaluación realista de los valores más
cambio de temperatura, humedad, contracción,                       probables en lugar de los valores del límite superior de las
fluencia lenta, etc.) se deberán considerar en                     variables. El valor más probable es el valor que se puede
combinación con otras cargas.                                      esperar en cualquier momento arbitrario. Cuando las
                                                                   cargas de coacción se combinan con cargas permanentes
El factor de carga que afecta a la carga T se deberá               como acción principal, se puede utilizar un factor de carga
establecer considerando la incertidumbre asociada                  de 1,2. Sin embargo, cuando se considera más de una carga


<!-- page 54 -->

                   REGLAMENTO                                                 COMENTARIO

con la magnitud probable de la carga, la probabilidad    variable y las cargas debidas a coacción se consideran una
de que el efecto máximo de T ocurra                      carga complementaria, el factor de carga se puede reducir
simultáneamente con otras cargas aplicadas, y las        siempre que sea poco probable que las cargas principal y
consecuencias adversas potenciales si el efecto de T     complementaria alcancen sus valores máximos al mismo
es mayor que el supuesto. El factor de carga para T      tiempo. El factor de carga aplicado a T no se debe
no debe tener un valor menor que 1,0.                    considerar con un valor inferior a 1,0.

                                                         Si solo se dispone de datos limitados para definir la
                                                         magnitud y la distribución de la frecuencia de la carga
                                                         debida a coacción, entonces su valor se debe estimar
                                                         cuidadosamente. La estimación de la incertidumbre en la
                                                         carga debida a coacción se puede complicar por la
                                                         variación de la rigidez del material del elemento o de la
                                                         estructura en consideración.

                                                         Cuando se verifique la capacidad de una estructura o
                                                         elemento estructural para resistir los efectos de las cargas
                                                         debidas a coacción se deberían considerar las siguientes
                                                         combinaciones de acciones:

                                                                            1,2 D + 1,2 T + 0,5 L
                                                                            1,2 D + 1,6 L + 1,0 T

                                                         Estas combinaciones no son exhaustivas y será necesario
                                                         evaluarlas en algunas situaciones específicas. Por ejemplo,
                                                         cuando las sobrecargas de cubierta o las cargas de nieve
                                                         sean significativas y puedan ocurrir simultáneamente con
                                                         las cargas debidas a coacción, se debería incluir su efecto.
                                                         El diseño se debería basar en la combinación de la carga
                                                         que cause el efecto más desfavorable.


<a id="c2.3.5"></a>
### 2.3.5 Combinaciones de carga para cargas no             C 2.3.5. Combinaciones de carga para cargas no  <sub>p.55</sub>

       especificadas                                              especificadas

Siempre que la Autoridad Fiscalizadora o de              En algunas ocasiones los Proyectistas Estructurales pueden
Aplicación lo apruebe, se le permitirá al Profesional    desear desarrollar criterios de carga para el diseño por
responsable del diseño estructural determinar el         resistencia que sean coherentes con los requisitos de la
efecto de las cargas combinadas para el diseño por       especificación ASCE 7, en algunas situaciones en las que
resistencia utilizando un método que sea consistente     dicha especificación no proporciona información sobre
con el método en el cual se basan los requisitos de la   cargas o combinaciones de carga. También pueden desear
combinación de cargas especificadas en el artículo       considerar criterios de carga para situaciones especiales,
2.3.2.                                                   según lo requiera el Propietario, en aplicaciones de
                                                         ingeniería basadas en desempeño (PBE), de acuerdo con el
Dicho método se deberá basar en probabilidades y         artículo 1.3.1.3.
deberá ser acompañado por documentación que
considere el análisis y la recolección de datos          Los equipos responsables de definir los criterios de diseño
soporte que sea aceptable para la Autoridad              por resistencia para el diseño de sistemas y elementos
Fiscalizadora.                                           estructurales pueden desear desarrollar factores de
                                                         resistencia que sean coherentes con lo establecido en
                                                         ASCE 7 y en los Reglamentos CIRSOC e INPRES-
                                                         CIRSOC.

                                                         Dichos criterios de carga se deberían desarrollar utilizando
                                                         un procedimiento estandarizado para asegurar que las
                                                         cargas de diseño mayoradas resultantes y las combinacio-
                                                         nes de carga conduzcan a fiabilidades objetivo (o a niveles
                                                         de desempeño) que puedan compararse con los criterios de
                                                         carga habitualmente utilizados, establecidos en el artículo
                                                         2.3.2.

                                                         Los requisitos de combinación de carga dados en el
                                                         mencionado artículo 2.3.2 y en los criterios de resistencia

Reglamento CIRSOC 101-25                                                                                   Cap. 2 - 39


<!-- page 55 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   para los siguientes materiales:

                                                                   - para el acero en la especificación AISC (2010) utilizada
                                                                     de base para el Reglamento CIRSOC 301-2018,

                                                                   - para el hormigón estructural en ACI 318-05 (2005),
                                                                     documento utilizado de base para el Reglamento
                                                                     CIRSOC 201-05,

                                                                   - para el aluminio estructural en la especificación
                                                                     utilizada de base para desarrollar el CIRSOC 701-2010
                                                                     (Specification for Aluminum Structures),

                                                                   - para la construcción estructural con madera en ANSI /
                                                                     AF & PA NDS-2005 National Design Specifications for
                                                                     Wood Construction, base del Reglamento CIRSOC 601-
                                                                     2016,

                                                                   - para mampostería estructural en TMS 402 / ACI 530 /
                                                                     ASCE 5, Buildings Code Requirements for Masonry
                                                                     Structures, documento base para el desarrollo del

                                                                   se basan en conceptos modernos de la teoría de la
                                                                   fiabilidad estructural. En el diseño de estados límite basado
                                                                   en probabilidades (PBLSD), la fiabilidad se mide mediante
                                                                   un índice de fiabilidad, , que está relacionado
                                                                   (aproximadamente) con la probabilidad del estado límite
                                                                   por Pf =  (–).

                                                                   El enfoque adoptado en el PBLSD fue:

                                                                   1. Determinar un conjunto de objetivos de fiabilidad o
                                                                      puntos de referencia, expresados en función de , para
                                                                      un espectro de diseños de elementos estructurales
                                                                      tradicionales que incluyeran acero, hormigón armado,
                                                                      aluminio, madera estructural y mampostería estructural.

                                                                      En este ejercicio de calibración se enfatizaron las
                                                                      situaciones de carga debidas a la acción de la gravedad,
                                                                      pero también se consideraron las cargas debidas a la
                                                                      acción del viento y de los sismos. Un grupo de expertos
                                                                      en especificaciones de materiales participó en la
                                                                      evaluación de los resultados de esta calibración y en la
                                                                      selección de la fiabilidad buscada. Los marcadores o
                                                                      puntos de referencia de fiabilidad así identificados no
                                                                      son los mismos para todos los estados límite. Si el
                                                                      modo de falla es relativamente dúctil y las
                                                                      consecuencias no son serias,  tiende a estar en el rango
                                                                      de 2,5 a 3,0, mientras que si el modo de falla es frágil y
                                                                      las consecuencias son severas,  será igual o mayor que
                                                                      4,0.

                                                                   2. Determinar el conjunto de factores de carga y
                                                                      resistencia que mejor cumpla con los objetivos de
                                                                      fiabilidad identificados en el ítem 1 de este artículo, en
                                                                      un sentido general, considerando el alcance de las
                                                                      estructuras que podrían ser diseñadas mediante ASCE
                                                                      7-2010 y las especificaciones de materiales y códigos
                                                                      que las referencian.


<!-- page 56 -->

                   REGLAMENTO                           COMENTARIO

                                Los requisitos de combinación de carga que aparecen en el
                                artículo 2.3.2, utilizaron esta aproximación, que se basa en
                                un formato de “acción principal-acción complementaria”,
                                en el que una carga se considera con su valor máximo
                                mientras que otras cargas se adoptan con sus valores en un
                                momento determinado.

                                Basado en el análisis integral de fiabilidad realizado para
                                respaldar su desarrollo, se encontró que estos factores de
                                carga logran una muy buena aproximación mediante la
                                siguiente expresión:

                                           Q = (Q / Qn) (1 + Q  VQ)               (C 2.3.1)

                                siendo:

                                Q     la carga media,

                                Qn     la carga nominal especificada en los distintos
                                       capítulos de ASCE 7 y en los Reglamentos CIRSOC
                                       que se han desarrollado en base a dicho documento,

                                VQ     el coeficiente de variación de la carga,

                                      el índice de fiabilidad, y

                                Q     un coeficiente de sensibilidad que es aproximada-
                                       mente igual a 0,8 cuando Q es una acción principal
                                       y 0,4 cuando Q es una acción complementaria.

                                Esta aproximación es válida para una amplia gama de
                                distribuciones de probabilidad habituales que se utilizan
                                para modelar cargas estructurales. El factor de carga es una
                                función creciente del sesgo en la estimación de la carga
                                nominal, la variabilidad en la carga y el índice de fiabilidad
                                objetivo, como dictaría el sentido común.

                                Como ejemplo, los factores de carga en la combinación 2
                                del artículo 2.3.2 se basan en lograr un  de aproximada-
                                mente 3,0 para un estado límite dúctil con consecuencias
                                moderadas (por ejemplo, formación de la primera rótula
                                plástica en una viga de acero).

                                Para la sobrecarga actuando como acción principal:

                                                 Q / Qn = 1,0 y VQ = 0,25

                                Para la sobrecarga actuando como acción complemen-
                                taria:

                                                  Q / Qn ≈ 0,3 y VQ ≈ 0,6

                                Sustituyendo estos valores estadísticos en la expresión
                                C 2.3.1, resultaría:

                                Q = 1,0 [1 + 0,8 (3) (0,25)] = 1,6    (acción principal) y
                                Q = 0,3 [1 + 0,4 (3) (0,60)] = 0,52   (acción complementaria)

                                El documento ASCE 7-05 estableció los valores 1,60 y
                                0,50 para estos factores de sobrecarga en las combinacio-

Reglamento CIRSOC 101-25                                                              Cap. 2 - 41


<!-- page 57 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   nes (2) y (3).

                                                                   Si un Proyectista Estructural elige diseñar para una
                                                                   probabilidad de estado límite que sea menor que el caso
                                                                   estándar, por un factor de aproximadamente 10, el valor 
                                                                   aumentaría a aproximadamente 3,7 y el factor de sobrecar-
                                                                   ga principal aumentaría a aproximadamente 1,74.

                                                                   De manera similar, los factores de resistencia que son
                                                                   coherentes con los factores de carga anteriormente citados,
                                                                   se aproximan bien para la mayoría de los materiales
                                                                   mediante la siguiente expresión:

                                                                         = (R / Rn) exp [–R  VR]                    (C 2.3.2)

                                                                   siendo:

                                                                   R     la fuerza media,
                                                                   Rn     la fuerza especificada en el Reglamento,
                                                                   VR     el coeficiente de variación en la fuerza, y

                                                                   R     el coeficiente de sensibilidad aproximadamente
                                                                          igual a 0,7.

                                                                   Para el estado límite de fluencia en un elemento de tensión
                                                                   de acero ASTM A992, con un límite de fluencia
                                                                   especificado de 345 MPa, la relación R / Rn = 1,06 (bajo
                                                                   un estado estático de carga) y VR = 0,09.

                                                                   Entonces la expresión C 2.3.2 resulta:

                                                                    = 1,06 exp [-(0,7) (3,0) (0,09)] = 0,88

                                                                   El factor de resistencia para tracción dado en la Sección D
                                                                   de la Especificación ANSI - AISC 360 (2010) se establece
                                                                   igual a 0,9.

                                                                   Cuando un objetivo de rendimiento diferente requiera que
                                                                   la probabilidad del estado límite objetivo se reduzca en un
                                                                   factor de 10, entonces  disminuirá a 0,84, o sea tendrá una
                                                                   reducción de aproximadamente el 7 %.

                                                                   Se recomienda a los Proyectistas Estructurales que deseen
                                                                   calcular factores de resistencia alternativos para productos
                                                                   de madera estructural y otros componentes estructurales
                                                                   que, cuando los efectos de la duración de la carga puedan
                                                                   ser significativos, revisen los materiales de referencia
                                                                   proporcionados antes de usar la expresión C 2.3.2.

                                                                   Hay dos cuestiones clave que se deben abordar para
                                                                   utilizar las expresiones C 2.3.1 y C 2.3.2:

                                                                   - selección del índice de fiabilidad , y

                                                                   - determinación de las estadísticas de carga y resistencia.

                                                                   El índice de fiabilidad controla el nivel de seguridad, y su
                                                                   selección debería depender del modo y consecuencia de
                                                                   la falla.


<!-- page 58 -->

                   REGLAMENTO                        COMENTARIO

                                Las cargas y los factores de carga en ASCE 7 no explican
                                explícitamente los índices de fiabilidad más altos que
                                normalmente se desean para los mecanismos de falla
                                frágiles o las consecuencias más serias de la falla. Los
                                estándares comunes para el diseño de materiales
                                estructurales a menudo tienen en cuenta tales diferencias
                                en sus factores de resistencia (por ejemplo, el diseño de
                                conexiones según AISC o el diseño de columnas según
                                ACI).

                                La Tabla C 1.3.1 proporciona pautas generales para selec-
                                cionar fiabilidades objetivo, coherentes con los extensos
                                estudios de calibración realizados anteriormente para
                                desarrollar los requisitos de carga establecidos en el
                                artículo 2.3.2 y los factores de resistencia en los estándares
                                de diseño para materiales estructurales.

                                Los índices de fiabilidad en esos estudios anteriores se
                                determinaron para elementos estructurales con base en un
                                período de servicio de 50 años.

                                Las fiabilidades del sistema son más altas en un grado
                                que depende de la redundancia y ductilidad estructural.

                                Las probabilidades representan, en orden de magnitud, los
                                índices de falla anuales asociados de los elementos para
                                aquellos que pudieran encontrar útil esta información al
                                seleccionar un objetivo de fiabilidad.

                                Los requisitos de carga especificados en los artículos 2.3.2
                                a 2.3.4 están respaldados por una cantidad importante de
                                bases de datos estadísticos revisadas por pares, y los
                                valores de la media y el coeficiente de variación, Q / Qn
                                y VQ , están bien establecidos. Este soporte puede no exis-
                                tir para otras cargas que tradicionalmente no han sido
                                cubiertas por ASCE 7.

                                De manera similar, las estadísticas utilizadas para
                                determinar R / Rn y VR deberían ser coherentes con la
                                especificación del material subyacente. Cuando las
                                estadísticas se basen en programas de prueba de lotes
                                pequeños, todas las fuentes razonables de variabilidad del
                                uso final deberían incorporarse en el plan de muestreo.

                                El Proyectista Estructural debería documentar la base de
                                todas las estadísticas seleccionadas en el análisis y
                                presentar la documentación para su revisión por parte de la
                                autoridad competente. Dichos documentos deberían formar
                                parte del registro de diseño permanente.

                                Se advierte al Proyectista Estructural que los criterios de
                                carga y resistencia necesarios para lograr un objetivo de
                                desempeño basado en la fiabilidad están acoplados a través
                                del término común,  en las expresiones C 2.3.1 y C 2.3.2.

                                Los ajustes a los factores de carga sin los correspon-
                                dientes ajustes a los factores de resistencia conducirán a
                                un cambio impredecible en el rendimiento estructural y
                                en la fiabilidad.

Reglamento CIRSOC 101-25                                                           Cap. 2 - 43


<!-- page 59 -->

                      REGLAMENTO                                                         COMENTARIO


<a id="c2.4"></a>
### 2.4 COMBINACIONES  DE   CARGA                      PARA        C 2.4. COMBINACIONES DE CARGA                          PARA  <sub>p.60</sub>

        EVENTOS EXTRAORDINARIOS                                           EVENTOS EXTRAORDINARIOS


<a id="c2.4.1"></a>
### 2.4.1 Campo de validez                                            Este artículo advierte al Proyectista Estructural que ciertas  <sub>p.60</sub>

                                                                   circunstancias pueden requerir que las estructuras se
Cuando lo requiera el Propietario o el Código de                   revisen para detectar eventos de baja probabilidad, como
Edificación que sea de aplicación, se deberá verificar             incendios, explosiones e impactos vehiculares.
la resistencia y la estabilidad de la estructura con el
fin de asegurar que las mismas sean capaces de                     Desde la edición 1995 del documento ASCE 7, el
resistir los efectos de eventos extraordinarios (por               comentario al artículo 2.4 ha proporcionado un conjunto de
ejemplo de baja probabilidad) tales como incendios,                combinaciones de carga que se dedujeron utilizando una
explosiones o impactos vehiculares sin daño                        base probabilística similar a la utilizada para desarrollar los
(colapso) desproporcionado.                                        requisitos de combinación de carga para cargas habituales
                                                                   especificadas en el artículo 2.3.

<a id="c2.4.2"></a>
### 2.4.2 Combinaciones de carga  <sub>p.60</sub>

                                                                   En los últimos años, los eventos sociales y políticos han

<a id="c2.4.2.1"></a>
### 2.4.2.1 Capacidad de una estructura o elemento                    llevado a buena parte de los Proyectistas Estructurales,  <sub>p.60</sub>

         estructural                                               Ingenieros, Arquitectos, Desarrolladores de proyectos y
                                                                   Autoridades de Fiscalización o Jurisdiccionales manifestar
Para verificar la capacidad de una estructura o                    un creciente deseo de mejorar las prácticas de diseño y
elemento estructural de resistir el efecto de un evento            construcción de ciertos edificios con el fin de lograr una
extraordinario, se deberá considerar la siguiente                  robustez estructural adicional y una disminución de la
combinación de cargas gravitatorias:                               probabilidad de colapso desproporcionado en caso de
                                                                   ocurrir un evento anormal.
        (0,9 ó 1,2) D + Ak + 0,5 L + 0,2 S            (2.4.1)
                                                                   En Estados Unidos, varias agencias federales, estatales y
                                                                   locales, han adoptado políticas que requieren que los
siendo:
                                                                   nuevos edificios y estructuras sean construidos con tales
                                                                   mejoras de solidez o robustez estructural (GSA, 2003; y
Ak      carga o efecto de carga resultado del evento
                                                                   DOD, 2009).
        extraordinario A.
                                                                   Por lo general, la solidez o robustez se evalúa mediante la

<a id="c2.4.2.2"></a>
### 2.4.2.2 Capacidad residual                                        eliminación hipotética de elementos estructurales clave que  <sub>p.60</sub>

                                                                   soportan carga, seguida de un análisis estructural para
Para verificar la capacidad de carga residual de una               evaluar la capacidad de la estructura para superar el daño
estructura o elemento estructural después de la                    (a menudo denominado análisis de ruta alternativa).
ocurrencia de un evento dañino, los elementos de
carga seleccionados por el Profesional Responsable                 Al mismo tiempo, los avances en la ingeniería estructural
del Diseño deberán ser eliminados teóricamente y la                para condiciones de incendio (por ejemplo, AISC 2010,
capacidad de la estructura dañada se evaluará                      Apéndice 4) plantean la posibilidad de que los nuevos
utilizando la siguiente combinación de cargas gravita-             requisitos de diseño estructural para la seguridad contra
torias:                                                            incendios complementen las disposiciones existentes que
                                                                   se consideran satisfactorias para los próximos años.
       (0,9 ó 1,2) D + 0,5 L + 0,2 (Lr ó S ó R)       (2.4.2)
                                                                   Para satisfacer estas necesidades, las combinaciones de

<a id="c2.4.3"></a>
### 2.4.3 Requisitos de estabilidad                                   carga para eventos extraordinarios se han trasladado a la  <sub>p.60</sub>

                                                                   Sección 2.5 de ASCE 7 cuando antes estaban en los
Se deberá proporcionar estabilidad a la estructura en              Comentarios.
su conjunto y a cada uno de sus elementos. Este
Reglamento permite utilizar cualquier método que                   Estas disposiciones no pretenden reemplazar los enfoques
considere la influencia de los efectos de segundo                  tradicionales para asegurar la resistencia al fuego basados
orden.                                                             en curvas estandarizadas de tiempo-temperatura y tiempos
                                                                   de resistencia especificados en los Códigos vigentes en
                                                                   Estados Unidos. Los tiempos de resistencia especificados
                                                                   en esos códigos se basan en la curva de tiempo-
                                                                   temperatura de la norma ASTM E119 bajo la carga de
                                                                   diseño permitida total.

                                                                   Los eventos extraordinarios surgen de condiciones
                                                                   ambientales o de servicio que tradicionalmente no eran
                                                                   consideradas explícitamente en el diseño de edificios
                                                                   comunes y otras estructuras. Tales eventos se caracterizan


<!-- page 60 -->

                   REGLAMENTO                        COMENTARIO

                                por una baja probabilidad de ocurrencia y generalmente
                                son de corta duración. Son pocos los edificios que alguna
                                vez están expuestos a tales eventos, y rara vez se dispone
                                de datos estadísticos para describir su magnitud y efectos
                                estructurales. En la categoría de eventos extraordinarios
                                estarían incluidos los incendios, las explosiones de líquidos
                                volátiles o gas natural en los sistemas de servicio del
                                edificio, sabotaje, impacto vehicular, mal uso por parte de
                                los ocupantes del edificio, hundimiento (no asentamiento)
                                del subsuelo y tornados.

                                Es probable que la ocurrencia de cualquiera de estos
                                eventos provoque daños o fallas estructurales. Si la
                                estructura no está diseñada y detallada correctamente, esta
                                falla local puede iniciar una reacción en cadena de fallas
                                que se propaguen a lo largo de una parte importante de la
                                estructura y conduzcan a un colapso total o parcial,
                                potencialmente catastrófico.

                                Aunque todos los edificios son susceptibles a tales
                                derrumbes en diversos grados, la construcción que carece
                                de continuidad y ductilidad inherentes es particularmente
                                vulnerable (Taylor, 1975; Breen and Siess, 1979; Carper
                                and Smilowitz, 2006; Nair, 2006; y NIST, 2007).

                                Las buenas prácticas de diseño requieren que las
                                estructuras sean robustas y que su seguridad y rendi-
                                miento no sean sensibles a las incertidumbres en las
                                cargas, las influencias ambientales y otras situaciones no
                                consideradas explícitamente en el diseño.

                                El sistema estructural debería estar diseñado de tal manera
                                que, si ocurre un evento extraordinario, la probabilidad de
                                daño proporcional al evento original sea suficientemente
                                pequeña (Carper and Smilowitz, 2006; y NIST, 2007).

                                La filosofía de diseñar para limitar la propagación de
                                daños en lugar de prevenirlos por completo es diferente
                                del enfoque tradicional del diseño para soportar cargas
                                permanentes, sobrecargas, cargas debidas a la acción del
                                viento y de la nieve, pero es similar a la filosofía adoptada
                                en el diseño sismorresistente moderno.

                                En general, los sistemas estructurales se deberían diseñar
                                con suficiente continuidad y ductilidad como para que se
                                puedan desarrollar trayectorias de carga alternativas
                                después de la falla de un elemento individual con el fin de
                                que no se produzca la falla de la estructura en su conjunto.

                                En un nivel simple, la continuidad se puede lograr
                                requiriendo el desarrollo de una fuerza de unión mínima,
                                como por ejemplo de 20 kN/m entre elementos estructura-
                                les (NIST, 2007).

                                Las fallas de los elementos individuales se pueden
                                controlar mediante medidas de protección que aseguren
                                que ningún elemento de carga esencial se vuelva ineficaz
                                como resultado de un accidente, aunque este enfoque
                                puede ser más difícil de implementar. Cuando la falla del
                                elemento resulte inevitablemente en un colapso despropor-
                                cionado, el elemento se debería diseñar para un mayor
                                grado de fiabilidad (NIST, 2007).

Reglamento CIRSOC 101-25                                                          Cap. 2 - 45


<!-- page 61 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   Los estados límite de diseño incluyen pérdida de equilibrio
                                                                   como cuerpo rígido, grandes deformaciones que conducen
                                                                   a efectos significativos de segundo orden, deformación o
                                                                   ruptura de elementos o conexiones, formación de mecanis-
                                                                   mos e inestabilidad de los elementos o de la estructura en
                                                                   su conjunto.

                                                                   Estos estados límite son los mismos que se consideran para
                                                                   otros eventos de carga, pero los mecanismos de resistencia
                                                                   a la carga en una estructura dañada pueden ser diferentes y
                                                                   fuente de capacidades de carga que normalmente no se
                                                                   considerarían en el diseño de estados límite últimos ordina-
                                                                   rios, como acciones de arco, de membrana o de catenaria.

                                                                   El uso del análisis elástico subestima la capacidad de carga
                                                                   de la estructura (Marjanishvili and Agnew, 2006). Se
                                                                   pueden utilizar análisis material o geométricamente no
                                                                   lineales o plásticos, dependiendo de la respuesta de la
                                                                   estructura a las acciones. Las disposiciones de diseño
                                                                   específicas para controlar el efecto de cargas extraordina-
                                                                   rias y el riesgo de falla progresiva se desarrollan con una
                                                                   base probabilística (Ellingwood and Leyendecker, 1978;
                                                                   Ellingwood and Corotis, 1991; y Ellingwood and
                                                                   Dusenberry, 2005).

                                                                   El Proyectista Estructural puede reducir la probabilidad de
                                                                   un evento extraordinario o diseñar la estructura para
                                                                   resistir o absorber el daño del evento si este ocurriera.

                                                                   Si F se considera el evento de falla (daño o colapso) y A el
                                                                   evento de que ocurra un hecho estructuralmente dañino, la
                                                                   probabilidad de falla debido a un evento A será:

                                                                          PAGF = PAG (F | A) ∙ PAG (A)               (C 2.4.1)

                                                                   siendo:

                                                                   PAG (F | A) la probabilidad condicional de falla de una
                                                                               estructura dañada, y

                                                                   PAG (A)        la probabilidad de ocurrencia del evento A.

                                                                   La separación de PAG (F | A) y PAG (A) permite centrarse
                                                                   en diferentes estrategias para reducir el riesgo.

                                                                   PAG (A) depende de la ubicación, el control del uso de
                                                                   sustancias peligrosas, la limitación del acceso y otras
                                                                   acciones que son esencialmente independientes del diseño
                                                                   estructural.

                                                                   En cambio PAG (F | A) depende de las medidas de diseño
                                                                   estructural que van desde las disposiciones mínimas para la
                                                                   continuidad hasta una evaluación estructural completa
                                                                   posterior al daño.

                                                                   La probabilidad, PAG (A), depende del peligro específico.
                                                                   Los datos limitados sobre incendios severos, explosiones
                                                                   de gas, explosiones de bombas y colisiones vehiculares
                                                                   indican que la probabilidad del evento depende del tamaño
                                                                   del edificio, medido en unidades de vivienda o en metros
                                                                   cuadrados, y varía de aproximadamente 0,2 × 10–6 / unidad
                                                                   de vivienda / año hasta aproximadamente 8,0 × 10–6 /
                                                                   unidad de vivienda / año (NIST, 2007).


<!-- page 62 -->

                   REGLAMENTO                        COMENTARIO

                                Por lo tanto, la probabilidad de que la estructura de un
                                edificio se vea afectada puede depender del número de
                                unidades de vivienda del edificio o de sus metros
                                cuadrados.

                                Si se fuera a establecer la probabilidad de estado límite
                                condicional, resultaría:

                                PAG (F | A) = 0,05 – 0,10

                                sin embargo, la probabilidad anual de falla estructural dada
                                en la expresión C 2.4.1 sería menor que 10–6, colocando el
                                riesgo en un segundo plano de baja magnitud junto con los
                                riesgos de accidentes raros (Pate-Cornell, 1994).

                                Los requisitos de diseño correspondientes a esta
                                probabilidad PAG (F | A) se pueden desarrollar utilizando
                                análisis de fiabilidad de primer orden siempre que se
                                disponga de la función de estado límite que describa el
                                comportamiento estructural (Ellingwood and Dusenberry,
                                2005). La acción estructural (fuerza o deformación
                                restringida) resultante de un evento extraordinario A,
                                utilizada en el diseño, se indica en Ak .

                                Para definir la distribución de frecuencia de la carga
                                (NIST, 2007; y Ellingwood and Dusenberry, 2005) solo se
                                dispone de datos limitados. La incertidumbre en la carga
                                debido al evento extraordinario se engloba en la selección
                                de un valor conservador de Ak , y por tanto el factor de
                                carga en Ak se establece igual a 1,0, como se hace en las
                                combinaciones que incluyen la carga sísmica E.

                                La carga permanente se puede multiplicar por el factor 0,9
                                siempre que tenga un efecto estabilizador. De lo contrario,
                                el factor de carga podrá ser 1,2, como ocurre con las
                                combinaciones habituales establecidas en el artículo 2.3.2.

                                En las acciones complementarias, los factores de carga
                                menores que 1,0 reflejan la pequeña probabilidad de que
                                ocurra la presencia conjunta de la carga extraordinaria y la
                                sobrecarga de diseño, nieve o viento.

                                Las acciones complementarias 0,5L y 0,2S corresponden,
                                aproximadamente, al valor medio de la sobrecarga máxima
                                anual y al valor medio de la carga de nieve máxima anual
                                respectivamente (Chalk and Corotis, 1980; y Ellingwood,
                                1981).

                                La acción complementaria en la expresión 2.4.1 incluye
                                solo la carga de nieve porque la probabilidad de una
                                coincidencia de Ak con Lr o R, que tienen una corta
                                duración en comparación con S, es despreciable. Un
                                conjunto similar de combinaciones de carga para eventos
                                extraordinarios aparece en el Eurocódigo 1 (2006).

                                El término 0,2W, que aparecía anteriormente en estas
                                combinaciones se ha eliminado y se ha sustituido por un
                                requisito para comprobar la estabilidad lateral.

                                Un enfoque para cumplir con este requisito, que se basa en
                                las recomendaciones del Structural Stability Research

Reglamento CIRSOC 101-25                                                          Cap. 2 - 47


<!-- page 63 -->

                     REGLAMENTO                                                          COMENTARIO

                                                                   Council (Galambos, 1998), es aplicar fuerzas hipotéticas
                                                                   laterales, Ni :

                                                                   Ni = 0,002 Pi       , a nivel i,

                                                                   siendo:

                                                                   Pi       la fuerza de gravedad de la expresión 2.4.1 o 2.4.2
                                                                             actuando a nivel i , en combinación con las otras
                                                                             cargas establecidas en dichas expresiones 2.4.1 o
                                                                             2.4.2.

                                                                   Es de hacer notar que la expresión 1.4.1 establece que,
                                                                   cuando se realice una comprobación de la integridad
                                                                   estructural general, las fuerzas laterales actuando sobre una
                                                                   estructura intacta serán iguales a 0,01 wx , siendo wx la
                                                                   carga permanente a nivel x.


<!-- page 64 -->

                    REGLAMENTO                                                COMENTARIO
