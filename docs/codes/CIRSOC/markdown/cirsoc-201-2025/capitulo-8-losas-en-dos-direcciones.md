# CIRSOC 201 (2025) — CAPÍTULO 8. LOSAS EN DOS DIRECCIONES

> Source: `CIRSOC 201-2025.pdf` · PDF pages 161–188
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c8.1"></a>
### 8.1 ALCANCE                                                    C 8.1. ALCANCE  <sub>p.161</sub>



<a id="c8.1.1"></a>
### 8.1.1 Los requisitos de este capítulo se deben                 Los métodos de cálculo que se presentan en este capítulo  <sub>p.161</sub>

aplicar al proyecto de sistemas de losas no                     se basan en el análisis de los resultados de una serie amplia
pretensadas y pretensadas armadas para flexión en               de ensayos (Burns and Hemakom, 1977; Gamble et al.,
dos direcciones, con o sin vigas entre los apoyos,              1969; Gerber and Burns, 1971; Guralnick and LaFraugh,
incluyendo las descritas en (a) hasta (d):                      1963; Hatcher et al., 1965, 1969; Hawkins, 1981; Jirsa et
                                                                al., 1966; PTI DC20.8; Smith and Burns, 1974; Scordelis
(a) Losas macizas.                                              et al., 1959; Vanderbilt et al., 1969; Xanthakis and Sozen,
                                                                1963) y en el historial, bien establecido, del
(b) Losas no compuestas construidas sobre “steel                comportamiento de diferentes sistemas de losas. Los
    decks”.                                                     principios fundamentales de proyecto aplican a todo
                                                                sistema estructural plano sometido a cargas transversales.
(c) Losas compuestas con elementos de hormigón                  Varias de las reglas específicas de proyecto, así como los
    construidos     en    etapas   diferentes pero              precedentes históricos, limitan los tipos de estructuras a los
    conectadas de manera que todos los elementos                cuales se aplica este capítulo. Los sistemas de losas que se
    resistan las fuerzas como una unidad.                       pueden proyectar de acuerdo con este capítulo incluyen
                                                                losas planas (placas planas con ábacos), placas planas,
(d) Sistemas de viguetas en dos direcciones de                  losas con vigas armadas en dos direcciones y losas
    acuerdo con el artículo 8.8.                                nervuradas.

                                                                Se excluyen las losas sobre el terreno que no transmiten
                                                                cargas verticales provenientes de otras partes de la
                                                                estructura al suelo.

                                                                Para losas con vigas, los procedimientos explícitos de
                                                                cálculo descritos en este capítulo aplican sólo cuando las
                                                                vigas se encuentran en los bordes del panel y cuando las
                                                                vigas están apoyadas sobre columnas u otros apoyos,
                                                                esencialmente rígidos verticalmente, colocados en las
                                                                esquinas del panel. Las losas en dos direcciones con vigas
                                                                en una dirección, en donde tanto losa y vigas están
                                                                soportadas por vigas principales en la otra dirección, se
                                                                pueden calcular de acuerdo con los requisitos generales de
                                                                este capítulo. Dichos cálculos se deberían basar en análisis
                                                                compatibles con la posición deformada de las vigas y vigas
                                                                principales de apoyo.

                                                                En las losas que se apoyan sobre tabiques, los
                                                                procedimientos explícitos de diseño de este capítulo
                                                                consideran al tabique como una viga infinitamente rígida.
                                                                Por lo tanto, cada tabique debería soportar la longitud total
                                                                de un borde del panel (ver artículo 8.4.1.7). Los tabiques
                                                                con una longitud menor a la longitud total del panel
                                                                pueden tratarse como columnas.


<a id="c8.2"></a>
### 8.2 GENERALIDADES                                              C 8.2. GENERALIDADES  <sub>p.161</sub>



<a id="c8.2.1"></a>
### 8.2.1 Un sistema de losa se puede calcular mediante            C 8.2.1. Esta sección permite el cálculo de solicitaciones  <sub>p.161</sub>

cualquier procedimiento que cumpla con las condi-               basado directamente en los principios fundamentales de la
ciones de equilibrio y compatibilidad geométrica,               mecánica estructural, siempre que se pueda demostrar de
siempre que la resistencia de cálculo en cada                   manera explícita que se satisfacen todos los criterios de
sección sea al menos igual a la resistencia requerida,          resistencia y de comportamiento en servicio. El cálculo de
y que se cumplan todos los requisitos del                       la losa se puede lograr mediante el uso combinado de
comportamiento en servicio. Se permite el método de             soluciones clásicas basadas en un medio continuo
cálculo directo o el método del pórtico equivalente.            linealmente elástico, soluciones numéricas basadas en
                                                                elementos discretos o análisis de líneas de fluencia,
                                                                             en todos los casos la evaluación de las


<!-- page 161 -->

                    REGLAMENTO                                                 COMENTARIO

                                                          condiciones de tensión alrededor de los apoyos en relación
                                                          con corte, torsión y flexión, así como los efectos de rigidez
                                                          reducida de los elementos debida a la fisuración y la
                                                          geometría de los apoyos. El cálculo de un sistema de losa
                                                          implica algo más que su análisis, y cualquier variación en
                                                          las dimensiones físicas de la losa con respecto a la práctica
                                                          común debería ser justificada con base en el conocimiento
                                                          de las cargas esperadas y en la confiabilidad de las
                                                          tensiones y deformaciones calculadas para la estructura.

                                                          El método de cálculo directo y el método de pórtico
                                                          equivalente están limitados en su aplicación a pórticos
                                                          ortogonales sometidos solo a cargas gravitacionales.


<a id="c8.2.2"></a>
### 8.2.2 Se deben considerar en el cálculo los efectos      C 8.2.2. Ver artículo C 7.2.1.  <sub>p.162</sub>

de las cargas concentradas, de las aberturas de la
losa y los vacíos de la losa.


<a id="c8.2.3"></a>
### 8.2.3 Las losas pretensadas con una tensión  <sub>p.162</sub>

efectiva promedio a compresión menor a 0,9 MPa
deben calcularse como losas no pretensadas.


<a id="c8.2.4"></a>
### 8.2.4 Los ábacos, en losas no pretensadas, usados        C 8.2.4 y C 8.2.5. Las dimensiones del ábaco especificadas  <sub>p.162</sub>

para reducir el espesor mínimo requerido de acuerdo       en el artículo 8.2.4 son necesarias cuando se utiliza para
con el artículo 8.3.1.1 ó la cantidad de armadura para    reducir la cantidad de armadura de momento negativo de
momento negativo sobre un apoyo, de acuerdo con           acuerdo con el artículo 8.5.2.2 o para satisfacer el espesor
el artículo 8.5.2.2, deben cumplir con (a) y (b):         mínimo de la losa permitido en el artículo 8.3.1.1. Si las
                                                          dimensiones son menores a las especificadas en el artículo
(a) El ábaco debe proyectarse bajo la losa al menos       8.2.4, se puede usar la proyección como cabezales de corte
    una cuarta parte del espesor de la losa               para aumentar la resistencia al corte de la losa. Para losas
    adyacente.                                            con cambios de espesor, es necesario verificar la
                                                          resistencia al corte en varias secciones (ver artículo
(b) El ábaco debe extenderse en cada dirección            22.6.4.1(b)).
    desde la línea central de apoyo por una distancia
    no menor a un sexto de la longitud del vano
    medida centro a centro de los apoyos en esa
    dirección.


<a id="c8.2.5"></a>
### 8.2.5 Cuando se use un cabezal de corte para  <sub>p.162</sub>

aumentar la sección crítica para corte en un nudo
losa-columna, el cabezal de corte debe proyectarse
hacia abajo de la superficie inferior de la losa y
extenderse una distancia horizontal medida desde la
cara de la columna que sea al menos igual al
espesor de la proyección bajo la superficie inferior de
la losa.


<a id="c8.2.6"></a>
### 8.2.6 Materiales  <sub>p.162</sub>



<a id="c8.2.6.1"></a>
### 8.2.6.1 Las propiedades de diseño para el hormigón  <sub>p.162</sub>

deben seleccionarse de acuerdo con el Capítulo 19.


<a id="c8.2.6.2"></a>
### 8.2.6.2 Las propiedades de diseño para el acero de  <sub>p.162</sub>

la armadura deben seleccionarse de acuerdo con el
Capítulo 20.


<a id="c8.2.6.3"></a>
### 8.2.6.3 Los materiales, dimensionamiento y  <sub>p.162</sub>

detallado de insertos embebidos en el hormigón
deben cumplir con 20.6.

Reglamento CIRSOC 201-25                                                                                   Cap. 8 - 130


<!-- page 162 -->

                        REGLAMENTO                                                              COMENTARIO


<a id="c8.2.7"></a>
### 8.2.7 Conexiones a otros elementos                                       C 8.2.7. Conexiones a otros elementos  <sub>p.163</sub>



<a id="c8.2.7.1"></a>
### 8.2.7.1 Las conexiones viga-columna y losa-columna                       La seguridad de un sistema de losa requiere que se tenga  <sub>p.163</sub>

deben cumplir con los requisitos del Capítulo 15.                         en cuenta la transmisión de la carga desde la losa a las
                                                                          columnas por flexión, torsión y corte.


<a id="c8.3"></a>
### 8.3 LÍMITES DE DISEÑO                                                    C 8.3. LÍMITES DE DISEÑO  <sub>p.163</sub>



<a id="c8.3.1"></a>
### 8.3.1 Espesor mínimo de la losa                                          C 8.3.1. Espesor mínimo de la losa  <sub>p.163</sub>


                                                                          Los espesores mínimos de losa de los artículos 8.3.1.1 y
                                                                          8.3.1.2 son independientes de la carga y del módulo de
                                                                          elasticidad del hormigón, los cuales tienen una influencia
                                                                          importante en las flechas. Estos espesores mínimos no son
                                                                          aplicables a losas con cargas de larga duración
                                                                          inusualmente altas o construidas con hormigón que tenga
                                                                          un módulo de elasticidad significativamente menor que el
                                                                          de hormigón común de peso normal. En estas situaciones
                                                                          se deben calcular las flechas.


<a id="c8.3.1.1"></a>
### 8.3.1.1 Para las losas no pretensadas sin vigas                          C 8.3.1.1. Los espesores mínimos dados en la Tabla  <sub>p.163</sub>

interiores que se extiendan entre los apoyos en todos                     8.3.1.1 corresponden a aquellos que se han desarrollado a
los lados y que tengan una relación entre los lados                       través de los años. El uso de armadura longitudinal con
no mayor de 2, el espesor total de la losa h no debe                      fy > 550 MPa puede conducir a mayores flechas a largo
ser menor que los valores dados en la Tabla 8.3.1.1                       plazo que en los casos con fy < 550 MPa a menos que las
y no debe ser menor al valor dado en (a) o (b), a                         tensiones de servicio asociadas calculadas para secciones
menos que se cumplan los límites de flechas                               fisuradas sean menores que 280 MPa. Debería realizarse
calculadas según el artículo 8.3.2.                                       un cálculo cuidadoso de las flechas.
(a) Losas sin ábacos como se definen
    en el artículo 8.2.4. .................................120 mm

(b) Losas con ábacos como se definen
    en el artículo 8.2.4. .................................100 mm

Tabla 8.3.1.1. Espesor mínimo de losas no pretensadas en dos direcciones sin vigas interiores (mm) [1]

                                       Sin ábacos [3]                                              Con ábacos [3]
       fy                 Paneles exteriores                                          Paneles exteriores
     MPa [2]                                                  Paneles                                                      Paneles
                   Sin vigas de        Con vigas de          interiores         Sin vigas de       Con vigas de           interiores
                      borde              borde [4]                                 borde             borde [4]
                         n                  n                  n                  n                  n                   n
         280
                         33                  36                  36                  36                  40                   40
                         n                  n                  n                  n                  n                   n
         420
                         30                  33                  33                  33                  36                   36
                         n                  n                  n                  n                  n                   n
         550
                         27                  30                  30                  30                  33                   33
   [1]
         n es la luz libre en la dirección larga, medida entre caras de los apoyos (mm).
   [2]
         Para fy con valores intermedios a los dados en la tabla, el espesor mínimo debe obtenerse por interpolación lineal. A los fines
         de este Reglamento sólo se deberán utilizar valores de fy iguales a 220 MPa, 420 MPa y 500 MPa respectivamente. El valor
         correspondiente a fy = 500 MPa se deberá obtener por interpolación lineal y el valor correspondiente a fy = 220 MPa por
         extrapolación.
   [3]
         Ábaco, como se define en el artículo 8.2.4.
   [4]
         Losas con vigas entre columnas a lo largo de los bordes exteriores. Los paneles exteriores se deben considerar como sin
         vigas de borde si f es menor que 0,8.


<!-- page 163 -->

                           REGLAMENTO                                                              COMENTARIO

8.3.1.2. Para losas no pretensadas con vigas entre                            C 8.3.1.2. Para paneles que tengan una relación entre la
apoyos en todos los lados, el espesor total de la losa                        luz larga y la luz corta mayor que 2, el uso de las
h debe cumplir con los límites dados en la Tabla                              ecuaciones (b) y (d) de la Tabla 8.3.1.2, que indican el
8.3.1.2 a menos que la flecha calculada cumpla con                            espesor mínimo como una fracción de la luz larga, pueden
los límites dados en el artículo 8.3.2.                                       conducir a resultados no razonables. Para dichos paneles
                                                                              deberían usarse las reglas para losas en una dirección del
Tabla 8.3.1.2. Espesor mínimo de las losas no                                 artículo 7.3.1.
pretensadas de dos direcciones con vigas entre
los apoyos en todos los lados

       fm [1]           Espesor mínimo, h , mm

      fm ≤ 0,2                 Se aplica 8.3.1.1.                 (a)
                                                    f
                                          n (0,8 + y )
                                                     1400
                                   h=                           (b) [2],[3]
                        Mayor           36 + 5(fm - 0,2)
0,2 < fm ≤ 2,0
                         de:
                                             120                   (c)
                                                    f
                                          n (0,8 + y )
                                                   1400            (d)
                        Mayor        h=
      fm > 2,0                              36 + 9
                         de:
                                              90                   (e)
[1]
       fm es el valor promedio de f para todas las vigas en el
       borde de un panel.
[2]
       n corresponde a la luz libre en la dirección larga, medida cara
       a cara de las vigas (mm).
[3]
       El término  es la relación de la luz libre en la dirección larga
       a la luz libre en la dirección corta de la losa.


<a id="c8.3.1.2.1"></a>
### 8.3.1.2.1 En bordes discontinuos de losas que  <sub>p.164</sub>

cumplen con el artículo 8.3.1.2, debe disponerse una
viga de borde con un f ≥ 0,80, o bien se debe
aumentar el espesor mínimo requerido por (b) o (d)
de la Tabla 8.3.1.2, por lo menos un 10 % en el
panel que tenga un borde discontinuo.


<a id="c8.3.1.3"></a>
### 8.3.1.3 El espesor de una capa de terminación de                             C 8.3.1.3. El Reglamento no especifica un espesor  <sub>p.164</sub>

hormigón puede incluirse en h siempre que se                                  adicional para superficies de desgaste sometidas a
construya monolíticamente con la losa, o cuando                               condiciones poco usuales de desgaste. Se deja a discreción
dicha capa se proyecte para que actúe como un                                 del profesional habilitado aumentar el espesor para
elemento compuesto de acuerdo con el artículo 16.4.                           condiciones poco usuales.


<a id="c8.3.1.4"></a>
### 8.3.1.4 Si se emplean estribos de una o varias  <sub>p.164</sub>

ramas como armadura de corte, la losa debe tener el
espesor suficiente para satisfacer los requisitos para
d dados en el artículo 22.6.7.1.


<a id="c8.3.2"></a>
### 8.3.2 Límites para la flecha según cálculo                                   C 8.3.2. Límites para la flecha según cálculo  <sub>p.164</sub>


8.3.2.1. Las flechas inmediatas y a largo plazo deben                         C 8.3.2.1. En losas planas pretensadas continuas con dos
calcularse de acuerdo con el artículo 24.2 y no deben                         o más vanos en cada dirección, la relación luz-espesor
exceder los límites establecidos en el artículo 24.2.2                        generalmente no debería exceder 42 para entrepisos y 48
para las losas en dos direcciones definidas en (a)                            para cubiertas. Estos límites pueden incrementarse a 48 y
hasta (c):                                                                    52, respectivamente, cuando los cálculos indican que la
                                                                              flecha tanto a corto como a largo plazo, la contraflecha, así
(a) Losas no pretensadas que no cumplen con el                                como la frecuencia natural de vibración y su amplitud, no
    artículo 8.3.1.                                                           sean objetables.

(b) Losas no pretensadas sin vigas interiores entre                           La flecha a corto y a largo plazo y la contraflecha deberían
    apoyos en todos los lados y que tienen una                                calcularse y verificarse con los requisitos de
    relación entre los lados corto y lado largo mayor                         comportamiento en servicio de la estructura.

Reglamento CIRSOC 201-25                                                                                                       Cap. 8 - 132


<!-- page 164 -->

                    REGLAMENTO                                                       COMENTARIO

    de 2,0.

(c) Losas pretensadas.


<a id="c8.3.2.2"></a>
### 8.3.2.2 Para las losas de hormigón compuestas no               C 8.3.2.2. Si cualquier parte de un elemento compuesto  <sub>p.165</sub>

pretensadas que cumplan con el artículo 8.3.1.1 ó               es pretensado, o si el elemento se pretensa después de que
8.3.1.2, no es necesario calcular la flecha que ocurre          se han construido los componentes, las disposiciones del
después de que el elemento se vuelve compuesto.                 artículo 8.3.2.1 aplican y deben calcularse las flechas. Para
Las flechas que ocurren antes de que el elemento se             elementos compuestos no pretensados las flechas deben
vuelva compuesto se deben investigar, a menos que               calcularse y compararse con los valores exigidos por la
el espesor antes de la acción compuesta también                 Tabla 24.2.2, sólo cuando la altura del elemento o de la
cumpla con el artículo 8.3.1.1 ó 8.3.1.2.                       parte prefabricada del elemento sea menor que la altura
                                                                mínima dada en la Tabla 8.3.1.1. En construcción sin
                                                                apuntalar, la altura correspondiente depende de si la flecha
                                                                se considera antes o después de lograr una acción
                                                                compuesta efectiva.


<a id="c8.3.3"></a>
### 8.3.3 Límite de la deformación específica de la                C 8.3.3. Límite de la deformación específica de la  <sub>p.165</sub>

       armadura en losas no pretensadas                                  armadura en losas no pretensadas


<a id="c8.3.3.1"></a>
### 8.3.3.1 Las losas no pretensadas deben ser                     C 8.3.3.1. Los fundamentos para el límite de la  <sub>p.165</sub>

controladas por tracción de acuerdo con la Tabla                deformación unitaria de losas en dos direcciones son los
21.2.2.                                                         mismos que para vigas. En el artículo C 9.3.3 se presenta
                                                                información adicional.


<a id="c8.3.4"></a>
### 8.3.4 Límites de las tensiones en losas preten-  <sub>p.165</sub>

       sadas


<a id="c8.3.4.1"></a>
### 8.3.4.1 Las losas pretensadas deben diseñarse  <sub>p.165</sub>

como Clase U con ft ≤ 0,50√f´c . Las tensiones en
losas pretensadas inmediatamente después de la
transferencia del pretensado y bajo las cargas de
servicio no deben exceder las tensiones permitidas
en los artículos 24.5.3 y 24.5.4, respectivamente.


<a id="c8.4"></a>
### 8.4 RESISTENCIA REQUERIDA                                      C 8.4. RESISTENCIA REQUERIDA  <sub>p.165</sub>



<a id="c8.4.1"></a>
### 8.4.1 Generalidades                                            C 8.4.1. Generalidades  <sub>p.165</sub>



<a id="c8.4.1.1"></a>
### 8.4.1.1 La resistencia requerida se debe calcular de  <sub>p.165</sub>

acuerdo con las combinaciones de mayoración de
cargas definidas en el Capítulo 5.


<a id="c8.4.1.2"></a>
### 8.4.1.2 La resistencia requerida se debe calcular de           C 8.4.1.2. Para determinar los momentos en servicio,  <sub>p.165</sub>

acuerdo con los procedimientos de análisis definidos            momentos mayorados, así como los cortes en sistemas de
en el Capítulo 6.                                               losas pretensadas se requiere el empleo de un análisis
                                                                numérico y no de enfoques simplificados tales como el
                                                                método de diseño directo. El método de análisis del
                                                                pórtico equivalente es un método numérico que ha
                                                                demostrado en ensayos de modelos estructurales de gran
                                                                escala predecir satisfactoriamente los momentos y cortes
                                                                mayorados en sistemas de losas pretensadas (Smith and
                                                                Burns 1974; Burns and Hemakom 1977; Hawkins 1981;
                                                                PTI DC20.8; Gerber and Burns 1971; Scordelis et al.
                                                                1959). Las investigaciones referidas también demuestran
                                                                que un análisis que emplea secciones prismáticas u otras
                                                                aproximaciones a la rigidez puede producir resultados
                                                                erróneos e inseguros. Se permite la redistribución de
                                                                momentos para losas pretensadas de acuerdo con el
                                                                artículo 6.6.5. El documento PTI DC20.8 da guías para el
                                                                diseño de sistemas de losas de hormigón pretensadas.


<!-- page 165 -->

                   REGLAMENTO                                                  COMENTARIO


<a id="c8.4.1.3"></a>
### 8.4.1.3 En losas pretensadas, los efectos de las  <sub>p.166</sub>

reacciones inducidas por el pretensado deben
tenerse en cuenta de acuerdo con el artículo 5.3.11.


<a id="c8.4.1.4"></a>
### 8.4.1.4 En un sistema de losa apoyado sobre  <sub>p.166</sub>

columnas o tabiques, las dimensiones c1, c2 y n
deben basarse en un área de apoyo efectiva. El área
de apoyo efectiva está definida por la intersección de
la superficie inferior de la losa, o del ábaco o cabezal
de corte si lo hubiera, con el mayor cono circular
recto, pirámide recta, o volumen en forma de cuña,
cuyas superficies estén localizadas dentro de la
columna y el capitel o cartela, y que estén orientadas
a un ángulo no mayor de 45° con respecto al eje de
la columna.


<a id="c8.4.1.5"></a>
### 8.4.1.5 Una faja de columna es una faja de diseño  <sub>p.166</sub>

con un ancho a cada lado del eje de la columna igual
a 0,252 ó 0,251 , el que sea menor. Las fajas de
columna deben incluir las vigas dentro de la faja, si
las hay.


<a id="c8.4.1.6"></a>
### 8.4.1.6 Una faja central es una faja de diseño  <sub>p.166</sub>

limitada por dos fajas de columna.


<a id="c8.4.1.7"></a>
### 8.4.1.7 Un panel de losa está circunscrito por los        C 8.4.1.7. Un panel de losa incluye todos los elementos a  <sub>p.166</sub>

ejes de las columnas, vigas o tabiques que existan         flexión comprendidos entre los ejes de las columnas. Por lo
en sus bordes.                                             tanto, la faja de columnas incluye las vigas, si las hay.


<a id="c8.4.1.8"></a>
### 8.4.1.8 Para construcción monolítica o totalmente         C 8.4.1.8. Para sistemas monolíticos o totalmente  <sub>p.166</sub>

compuesta que soporte losas en dos direcciones,            compuestos, las vigas incluyen partes de losa como si
una viga incluye la parte de la losa que está situada a    fueran alas. En la Figura C 8.4.1.8 se presentan dos
cada lado de la viga, por una distancia igual a la         ejemplos de la regla de este artículo.
proyección de la viga hacia arriba o hacia abajo de la
losa, la que sea mayor, pero no mayor que 4 veces
el espesor de la losa.

                                                           Figura C 8.4.1.8. Ejemplos de la parte de losa que debe
                                                           incluirse con la viga, según el artículo 8.4.1.8.


<a id="c8.4.1.9"></a>
### 8.4.1.9 Se permite combinar los resultados del  <sub>p.166</sub>

análisis de cargas gravitacionales con los resultados
de un análisis de cargas laterales.

Reglamento CIRSOC 201-25                                                                                   Cap. 8 - 134


<!-- page 166 -->

                       REGLAMENTO                                                      COMENTARIO


<a id="c8.4.2"></a>
### 8.4.2 Momento mayorado                                           C 8.4.2. Momento mayorado  <sub>p.167</sub>



<a id="c8.4.2.1"></a>
### 8.4.2.1 Para losas construidas integralmente con sus  <sub>p.167</sub>

apoyos, se permite calcular Mu en los apoyos en la
cara del apoyo.


<a id="c8.4.2.2"></a>
### 8.4.2.2 Momento mayorado resistido por la                        C 8.4.2.2. Momento mayorado resistido por la columna  <sub>p.167</sub>

         columna


<a id="c8.4.2.2.1"></a>
### 8.4.2.2.1 Si las cargas gravitacionales, de viento,              C 8.4.2.2.1. Esta sección es principalmente referente a los  <sub>p.167</sub>

sismo u otras causan transferencia de momento                     sistemas de losas sin vigas.
entre la losa y la columna, una fracción de Msc , el
momento mayorado de la losa resistido por la
columna en un nudo, debe ser transferida por flexión,
de acuerdo con los artículos 8.4.2.2.2 hasta
8.4.2.2.5.


<a id="c8.4.2.2.2"></a>
### 8.4.2.2.2 La fracción del momento mayorado de la  <sub>p.167</sub>

losa resistida por una columna, fMsc , se debe
considerar transmitida por flexión y f se calcula por
medio de:

                   1
       f =                                (8.4.2.2.2)
                   2 b
               1 +( )√ 1
                   3 b2


<a id="c8.4.2.2.3"></a>
### 8.4.2.2.3 El ancho efectivo de la losa bslab para                C 8.4.2.2.3. A menos que se adopten medidas para  <sub>p.167</sub>

resistir fMsc debe ser el ancho de la columna o                  resistir los esfuerzos torsionales y de corte, toda la
capitel más una distancia a cada lado de acuerdo                  armadura que resista la parte del momento que se transfiere
con la Tabla 8.4.2.2.3.                                           a la columna por flexión debería colocarse dentro de líneas
                                                                  ubicadas a una distancia igual a una y media veces el
                                                                  espesor de la losa o ábaco, 1,5h , a cada lado de la
                                                                  columna.
Tabla 8.4.2.2.3. Límites dimensionales del ancho
efectivo de la losa

                   Distancia a cada lado de la columna o
                                  capitel
 Sin ábaco o                         1,5h de la losa
                   Menor
 cabezal de
                    de         Distancia al borde de la losa
    corte
 Con ábaco o                1,5h del ábaco o cabezal de corte
                   Menor
  cabezal de                  Distancia a borde del ábaco o
                    de
    corte                  cabezal de corte más 1,5h de la losa


<a id="c8.4.2.2.4"></a>
### 8.4.2.2.4 Para losas no pretensadas, donde se                    C 8.4.2.2.4. Es posible cierta flexibilidad en la  <sub>p.167</sub>

satisfacen las limitaciones de vuv y t de la Tabla               distribución del Msc transferido por corte y flexión, tanto
8.4.2.2.4, se permite aumentar f a los valores                   en columnas exteriores como interiores. Las columnas
máximos modificados dados en la Tabla 8.4.2.2.4,                  interiores, exteriores y de esquina se refieren a conexiones
donde vc se calcula de acuerdo con el artículo 22.6.5.            losa-columna para las cuales el perímetro crítico de
                                                                  columnas rectangulares tiene cuatro, tres y dos lados,
                                                                  respectivamente.

                                                                  En columnas exteriores, en el caso de Msc alrededor de un
                                                                  eje paralelo al borde, la porción del momento transmitida
                                                                  por excentricidad de corte vMsc puede reducirse, siempre
                                                                  y cuando el corte mayorado en la columna (excluyendo el
                                                                  corte producido por la transferencia de momento) no
                                                                  exceda el 75 % de la resistencia al corte vc , como se
                                                                  define en el artículo 22.6.5.1, para columnas de borde o


<!-- page 167 -->

                        REGLAMENTO                                                            COMENTARIO

 Tabla 8.4.2.2.4. Valores máximos modificados de                         50 % para columnas de esquina. Los ensayos (Moehle,
 f para losas de dos direcciones no pretensadas                         1988; ACI 352.1R) indican que no hay una interacción
                                                                         significativa entre el corte y Msc en las columnas
Localiza-                                                                exteriores en estos casos. Es evidente que a medida que
           Direc-                      t
 ción de                                             f máximo           vMsc decrece, fMsc aumenta.
          ción de         vuv       (dentro
    la                                               modificado
           la luz                   de bslab)
columna                                                                  En las columnas interiores es posible cierta flexibilidad en
Columna                                                                  la distribución entre corte y flexión de Msc , pero con
            Cualquier    0,5vc    ≥ ty + 0,003
   de                                                     1,0
            dirección                                                    limitaciones más severas que en el caso de columnas
esquina
            Perpendi-                                                    exteriores. Para columnas interiores, se permite que Msc
             cular al    0,75vc   ≥ ty + 0,003         1,0
                                                                         transmitido por flexión se incremente hasta en un 25 %,
              borde
Columna                                                                  siempre y cuando el corte mayorado (excluyendo el corte
de borde                                               1,25
            Paralelo                                             ≤ 1,0   producido por el momento transferido) en la columna
                         0,4vc    ≥ ty + 0,008       2 b
            al borde                                1+ ( ) √ 1
                                                        3 b2             interior no exceda 40 % de la resistencia al corte vc ,
                                                                         como se define en el artículo 22.6.5.1.
                                                       1,25
Columna     Cualquier                                            ≤ 1,0
                         0,4vc    ≥ ty + 0,008       2 b              Cuando el corte mayorado para una conexión losa-columna
 interior   dirección                               1+ ( ) √ 1
                                                        3 b2
                                                                         es grande, el nudo losa-columna no siempre puede anclar
                                                                         toda la armadura colocada en el ancho efectivo. Las
                                                                         modificaciones para conexiones losa-columna interiores,
                                                                         especificadas en este requisito se permiten sólo cuando la
                                                                         armadura requerida para desarrollar fMsc dentro del
                                                                         ancho efectivo tiene una deformación específica neta en
                                                                         tracción t no menor de ty + 0,008 donde el valor de ty
                                                                         se determina en el artículo 21.2.2. El uso de la ecuación
                                                                         (8.4.2.2.2), sin las modificaciones permitidas en este
                                                                         requisito es indicativo generalmente de condiciones de
                                                                         sobretensión en el nudo. Este requisito pretende mejorar el
                                                                         comportamiento dúctil del nudo losa-columna. Cuando se
                                                                         produce una inversión de momento en las caras opuestas
                                                                         de una columna interior, tanto la armadura superior como
                                                                         la inferior deberían concentrarse dentro del ancho efectivo.
                                                                         Se ha observado que una relación entre la armadura
                                                                         superior y la inferior de aproximadamente 2 es adecuada.

                                                                         Antes del Reglamento, los límites de la deformación
                                                                         específica de t dados en la Tabla 8.4.2.2.4 eran constantes
                                                                         con valores de 0,004 y 0,010. A partir del Reglamento,
                                                                         para tener en cuenta armadura no tesa con resistencia a la
                                                                         fluencia mayores, estos límites fueron substituidos por las
                                                                         expresiones ty + 0,003 y ty + 0,008, respectivamente.
                                                                         La primera expresión es la misma que se usaba para el
                                                                         límite en t para la clasificación de elementos controlados
                                                                         por tracción en la Tabla 21.2.2; esta expresión se describe
                                                                         adicionalmente en el artículo C 21.2.2. La segunda
                                                                         expresión presenta un límite para t con resistencia a la
                                                                         fluencia de 420 MPa que es aproximadamente el mismo
                                                                         valor de la antigua constante 0,010.


<a id="c8.4.2.2.5"></a>
### 8.4.2.2.5 La armadura sobre la columna debe  <sub>p.168</sub>

 concentrarse utilizando una separación menor o por
 medio de armadura adicional para resistir el
 momento en el ancho efectivo de la losa definido en
 los artículos 8.4.2.2.2 y 8.4.2.2.3.


<a id="c8.4.2.2.6"></a>
### 8.4.2.2.6 La fracción de Msc que no se resiste por  <sub>p.168</sub>

 flexión debe suponerse que se transmite por
 excentricidad de corte, de acuerdo con el artículo
 8.4.4.2.

 Reglamento CIRSOC 201-25                                                                                                Cap. 8 - 136


<!-- page 168 -->

                    REGLAMENTO                                                       COMENTARIO


<a id="c8.4.3"></a>
### 8.4.3 Corte mayorado en una dirección  <sub>p.169</sub>



<a id="c8.4.3.1"></a>
### 8.4.3.1 Para losas construidas integralmente con los  <sub>p.169</sub>

apoyos, se permite que Vu en el apoyo se calcule en
la cara del apoyo.


<a id="c8.4.3.2"></a>
### 8.4.3.2 Las secciones localizadas entre la cara del  <sub>p.169</sub>

apoyo y una sección crítica ubicadas a una distancia
d medida desde la cara del apoyo para losas no
pretensadas y a una distancia h / 2 medida desde la
cara del apoyo en losas pretensadas, pueden
diseñarse para el Vu en la sección crítica siempre
que se cumplan las condiciones (a) hasta (c):

(a) La reacción en el apoyo en dirección del corte
    aplicado introduce compresión en las zonas del
    extremo de la losa.

(b) Las cargas son aplicadas en o cerca de la cara
    superior de la losa.

(c) No hay carga concentrada alguna aplicada entre
    la cara del apoyo y la sección crítica.


<a id="c8.4.4"></a>
### 8.4.4 Corte mayorado en dos direcciones                        C 8.4.4. Corte mayorado en dos direcciones  <sub>p.169</sub>


                                                                Las tensiones de corte calculadas en la losa alrededor de la
                                                                columna deben cumplir con los requisitos del artículo 22.6.

<a id="c8.4.4.1"></a>
### 8.4.4.1 Sección crítica  <sub>p.169</sub>



<a id="c8.4.4.1.1"></a>
### 8.4.4.1.1 Las losas deben ser evaluadas al corte en  <sub>p.169</sub>

dos direcciones en la proximidad de columnas, de
cargas concentradas y de zonas de reacción en las
secciones críticas de acuerdo con el artículo 22.6.4.


<a id="c8.4.4.1.2"></a>
### 8.4.4.1.2 Las losas armadas al corte con estribos o  <sub>p.169</sub>

pernos con cabeza se deben evaluar al corte en dos
direcciones en las secciones críticas de acuerdo con
el artículo 22.6.4.2.


<a id="c8.4.4.2"></a>
### 8.4.4.2 Tensión de corte mayorada en dos direc-                C 8.4.4.2. Tensión de corte mayorada en dos direc-  <sub>p.169</sub>

         ciones debida al corte y momento mayora-                          ciones debida al corte y momento mayora-
         dos de la losa resistidos por la columna                          dos de la losa resistidos por la columna


<a id="c8.4.4.2.1"></a>
### 8.4.4.2.1 Para corte en dos direcciones con  <sub>p.169</sub>

momento mayorado de la losa resistido por la
columna, la tensión de corte mayorada vu se debe
calcular en las secciones críticas definidas en el
artículo 8.4.4.1. La tensión de corte mayorada vu
corresponde a una combinación de vuv y de la
tensión de corte producida por vMsc , donde v se
define en el artículo 8.4.4.2.2 y Msc se define en el
artículo 8.4.2.2.1.


<a id="c8.4.4.2.2"></a>
### 8.4.4.2.2 La fracción de Msc transferida por                   C 8.4.4.2.2. Hanson and Hanson (1968) encontraron que  <sub>p.169</sub>

excentricidad de corte, vMsc , debe aplicarse en el            cuando el momento se transfiere entre la columna y la losa,
centro de gravedad de la sección crítica definida en            el 60 % del momento debería considerarse transmitido por
8.4.4.1, y:                                                     flexión a través del perímetro de la sección crítica definida
                                                                en el artículo 22.6.4.1, y el 40 % por excentricidad del
                                                                corte respecto al centro de gravedad de la sección crítica.
                   v = 1 – f                (8.4.4.2.2)
                                                                Para columnas     rectangulares, la porción del momento


<!-- page 169 -->

                   REGLAMENTO                                                COMENTARIO

                                                         transferido por flexión aumenta a medida que el ancho de
                                                         la cara de la sección crítica que resiste el momento
                                                         aumenta, como se indica en la ecuación (8.4.2.2.2).

                                                         La mayoría de los datos utilizados por Hanson and Hanson
                                                         (1968) se obtuvieron de ensayos hechos con columnas
                                                         cuadradas. Se dispone de poca información para columnas
                                                         redondas. No obstante, éstas pueden ser aproximadas como
                                                         columnas cuadradas que tienen la misma área de sección
                                                         transversal.


<a id="c8.4.4.2.3"></a>
### 8.4.4.2.3 La tensión de corte mayorada resultante de    C 8.4.4.2.3. La distribución de tensiones se supone tal  <sub>p.170</sub>

vMsc debe suponerse que varía linealmente               como se ilustra en la Figura C 8.4.4.2.3 para una columna
alrededor del centro de gravedad de la sección crítica   interior o exterior.
definida en el artículo 8.4.4.1.

                                                         Figura C 8.4.4.2.3. Distribución supuesta de las tensiones
                                                         de corte.

                                                         El perímetro de la sección crítica, ABCD, se determina de
                                                         acuerdo con el artículo 22.6.4.1. La tensión de corte
                                                         mayorada vuv y el momento mayorado de la losa resistido
                                                         por la columna Msc se determinan en el eje baricéntrico c-c
                                                         de la sección crítica. La tensión de corte máxima mayorada
                                                         puede calcularse a partir de:

                                                                                          v Msc cAB
                                                                          vu,AB = vuv -
                                                                                              Jc

                                                         o

                                                                                          v Msc cCD
                                                                          vu,CD = vuv -
                                                                                              Jc

                                                         donde v está dado por la ecuación (8.4.4.2.2).

                                                         Para una columna interior, Jc puede calcularse por medio
                                                         de:

Reglamento CIRSOC 201-25                                                                                   Cap. 8 - 138


<!-- page 170 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                Jc   = propiedad de la sección crítica supuesta, análoga al
                                                                       momento polar de inercia

                                                                         d (c1 +d)3 (c1 +d) d3 d (c2 +d)(c1 +d)2
                                                                     =             +          +
                                                                             6           6             2

                                                                Se pueden desarrollar ecuaciones similares a Jc para
                                                                columnas localizadas en el borde o la esquina de una losa.

                                                                De acuerdo con el artículo 8.4.2.2, la fracción de Msc no
                                                                transferida por excentricidad de corte debe transferirse por
                                                                flexión. Un método conservador asigna la fracción
                                                                transmitida por flexión al ancho efectivo de losa definido
                                                                en el artículo 8.4.2.2.3. En muchas ocasiones se concentra
                                                                la armadura de la faja de columna cercana a la columna,
                                                                para resistir Msc . Los datos disponibles de ensayos
                                                                (Hanson and Hanson, 1968) parecen indicar que esta
                                                                práctica no aumenta la resistencia al corte, pero puede ser
                                                                útil para aumentar la rigidez del nudo losa-columna.

                                                                Datos de ensayos (Hawkins, 1981) indican que la
                                                                resistencia para transferencia de momento de una conexión
                                                                losa-columna pretensada puede calcularse utilizando los
                                                                procedimientos de los artículos 8.4.2.2 y 8.4.4.2.

                                                                Donde se ha utilizado armadura de corte, la sección crítica
                                                                más allá de la armadura de corte en general tiene una
                                                                forma poligonal (Figura C 8.7.6(d) y (e)). Recomendamos
                                                                la lectura del ACI 421.1R donde se hayan las ecuaciones
                                                                para calcular la tensión de corte en ese tipo de secciones.


<a id="c8.5"></a>
### 8.5 RESISTENCIA DE CÁLCULO                                     C 8.5. RESISTENCIA DE CÁLCULO  <sub>p.171</sub>



<a id="c8.5.1"></a>
### 8.5.1 Generalidades                                            C 8.5.1. Generalidades  <sub>p.171</sub>



<a id="c8.5.1.1"></a>
### 8.5.1.1 Para cada combinación de mayoración de                 C 8.5.1.1. Ver artículo C 9.5.1.1.  <sub>p.171</sub>

carga aplicable, la resistencia de cálculo debe
cumplir Sn ≥ U , incluyendo (a) hasta (d). Debe
tenerse en cuenta la interacción entre efectos de
carga.

(a) Mn ≥ Mu         en todas las secciones del vano
                     en cada dirección.

(b) Mn ≥ f Msc dentro de bslab tal como se define
                 en el artículo 8.4.2.2.3.

(c) Vn ≥ Vu         para corte de una dirección en
                     todas las secciones del vano en
                     cada dirección.

(d) vn ≥ vu         para corte de dos direcciones en
                     las secciones críticas definidas en
                     el artículo 8.4.4.1.


<a id="c8.5.1.2"></a>
### 8.5.1.2 El valor de  debe estar de acuerdo con el  <sub>p.171</sub>

artículo 21.2.


<!-- page 171 -->

                   REGLAMENTO                                                 COMENTARIO


<a id="c8.5.2"></a>
### 8.5.2 Momento  <sub>p.172</sub>



<a id="c8.5.2.1"></a>
### 8.5.2.1 Mn se debe calcular de acuerdo con el  <sub>p.172</sub>

artículo 22.3.


<a id="c8.5.2.2"></a>
### 8.5.2.2 Al calcular Mn en losas no pretensadas con  <sub>p.172</sub>

ábacos, el espesor del ábaco bajo la losa no debe
adoptarse para el cálculo mayor a un cuarto de la
distancia medida desde el borde del ábaco a la cara
de la columna o capitel.


<a id="c8.5.2.3"></a>
### 8.5.2.3 Al calcular Mn en losas pretensadas, los  <sub>p.172</sub>

cordones externos deben considerarse como
cordones no adherentes a menos que los cordones
externos tengan adherencia efectiva a la losa en toda
su longitud.


<a id="c8.5.3"></a>
### 8.5.3 Corte                                              C 8.5.3. Corte  <sub>p.172</sub>



<a id="c8.5.3.1"></a>
### 8.5.3.1 La resistencia de cálculo al corte de losas en   C 8.5.3.1. Es necesario diferenciar entre una losa larga y  <sub>p.172</sub>

la cercanía de columnas, de cargas concentradas o         angosta que actúa como una viga, y una losa que actúa en
zonas de reacción está regida por la más severa de        dos direcciones en la cual la falla puede ocurrir por
las condiciones de los artículos 8.5.3.1.1 y 8.5.3.1.2.   punzonamiento en una superficie de cono truncado o
                                                          pirámide alrededor de una carga concentrada o zona de

<a id="c8.5.3.1.1"></a>
### 8.5.3.1.1 Para corte de una dirección, en donde          reacción.  <sub>p.172</sub>

cada una de las secciones críticas que deben
investigarse se extienden en un plano a través del
ancho total de la losa, Vn debe calcularse de acuerdo
con el artículo 22.5.


<a id="c8.5.3.1.2"></a>
### 8.5.3.1.2 Para corte en dos direcciones, vn debe  <sub>p.172</sub>

calcularse de acuerdo con el artículo 22.6.


<a id="c8.5.3.2"></a>
### 8.5.3.2 Para losas compuestas de hormigón, la  <sub>p.172</sub>

resistencia al corte horizontal, Vnh debe calcularse
de acuerdo con el artículo 16.4.


<a id="c8.5.4"></a>
### 8.5.4 Aberturas en los sistemas de losas  <sub>p.172</sub>



<a id="c8.5.4.1"></a>
### 8.5.4.1 Se permite dejar aberturas de cualquier  <sub>p.172</sub>

tamaño en los sistemas de losas si se demuestra por
medio de análisis que se cumplen todos los
requisitos de resistencia y condiciones de servicio,
incluyendo los límites especificados para las flechas.


<a id="c8.5.4.2"></a>
### 8.5.4.2 Como alternativa al artículo 8.5.4.1, en los  <sub>p.172</sub>

sistemas de losas sin vigas se permite dejar
aberturas de acuerdo con (a) hasta (d):

(a) Se permite dejar aberturas de cualquier tamaño
    en la zona común a dos fajas centrales que se
    intersecten, siempre que se mantenga como
    mínimo la cantidad total de armadura requerida
    para la losa sin aberturas.

(b) Donde dos fajas de columna se intersecten esta
    área no debe perforarse con aberturas de más
    de un octavo del ancho de la faja de columna de
    cualquiera de los dos vanos. En los lados de la
    abertura, debe añadirse una cantidad de

Reglamento CIRSOC 201-25                                                                                 Cap. 8 - 140


<!-- page 172 -->

                    REGLAMENTO                                                       COMENTARIO

    abertura.

(c) En la zona común a una faja de columna y una
    faja central no más de un cuarto de la armadura
    en cada faja puede interrumpirse por aberturas.
    Una cantidad de armadura equivalente a la
    interrumpida por la abertura debe añadirse a los
    lados de ésta.

(d) Cuando las aberturas están situadas una
    distancia menor a 4h de la periferia de una
    columna, de una carga concentrada o zona de
    reacción, se debe cumplir con el artículo
    22.6.4.3.


<a id="c8.6"></a>
### 8.6 LÍMITES DE ARMADURA                                        C 8.6. LÍMITES DE ARMADURA  <sub>p.173</sub>



<a id="c8.6.1"></a>
### 8.6.1 Armadura mínima a flexión en losas no                    C 8.6.1. Armadura mínima a flexión en losas no  <sub>p.173</sub>

       pretensadas                                                       pretensadas


<a id="c8.6.1.1"></a>
### 8.6.1.1 Se debe colocar un área mínima de                      C 8.6.1.1. El área requerida de armadura conformada o  <sub>p.173</sub>

armadura a flexión, As,min de 0,0018Ag , o como se              malla electrosoldada utilizada como armadura mínima a
define en el artículo 8.6.1.2, cerca de la cara en              flexión es la misma que la prevista para la armadura de
tracción de la losa en la dirección de la luz bajo              contracción y temperatura del artículo 24.4.3.2. Sin
consideración.                                                  embargo, mientras que se permite distribuir la armadura de
                                                                contracción y temperatura entre las dos caras de la losa
                                                                según se considere apropiado para condiciones específicas,
                                                                la armadura mínima a flexión debería ser colocada lo más
                                                                cerca posible de la cara del hormigón en tracción debido a
                                                                las cargas aplicadas.

                                                                La Figura C 8.6.1.1 ilustra la disposición de la armadura
                                                                mínima requerida cerca de la cara superior de una losa en
                                                                dos direcciones sometida a carga gravitacional uniforme-
                                                                mente distribuida. Los puntos de terminación de las barras
                                                                están basados en los requisitos mostrados en la Figura
                                                                8.7.4.1.3.

                                                                Para mejorar el control de fisuración y para intersectar las
                                                                fisuras de corte por punzonamiento con armadura a
                                                                tracción, el Proyectista Estructural debería considerar
                                                                especificar armadura continua en cada dirección cerca a
                                                                ambas caras en losas gruesas en dos direcciones tales como
                                                                losas de transferencia, losas de podios y plateas de
                                                                fundación. Ver también el artículo C 8.7.4.1.3.

                                                                Figura C 8.6.1.1. Disposición de la armadura mínima
                                                                cerca de la superficie superior de una losa en dos


<!-- page 173 -->

                   REGLAMENTO                                                   COMENTARIO


<a id="c8.6.1.2"></a>
### 8.6.1.2 Si vuv >  0,17 s  √f´c en la sección crítica   C 8.6.1.2. Ensayos de conexiones interiores losa-columna  <sub>p.174</sub>

para corte en dos direcciones alrededor de una             con o sin armadura de corte (Peiris and Ghali, 2012,
columna, carga concentrada, o área de reacción, el         Hawkins and Ospina, 2017, Widianto et al., 2009, Muttoni,
As,min que se coloque en el ancho bslab debe cumplir       2008, and Dam et al., 2017) han demostrado que la
                                                           fluencia de la armadura de tracción a flexión de la losa en
con la ecuación (8.6.1.2).
                                                           la vecindad de la columna o área cargada lleva a un
                         5 vuv bslab bo                    aumento de las rotaciones locales y a que se abra cualquier
              As,min =                       (8.6.1.2)     fisura inclinada existente dentro de la losa. En esos casos,
                             s fy                        el deslizamiento a lo largo de la fisura inclinada puede
                                                           llevar a una falla por punzonamiento iniciada por flexión
Donde bslab es el ancho especificado en el artículo        para un esfuerzo de corte menor que la resistencia que se
8.4.2.2.3, s está dado en el artículo 22.6.5.3,  es el   calcula para al corte en dos direcciones con las ecuaciones
valor para corte y s está dado en el artículo             de la Tabla 22.6.5.2 (para losas sin armadura de corte) y
22.5.5.1.3.                                                menor que la resistencia calculada de acuerdo con la Tabla
                                                           22.6.6.1 (para losas con armadura de corte).

                                                           Ensayos de losas con armadura de flexión menor que
                                                           As,min han demostrado que la armadura de corte no
                                                           incrementa la resistencia al corte por punzonamiento. No
                                                           obstante, la armadura de corte puede aumentar la
                                                           capacidad de rotación plástica antes de que ocurra la falla
                                                           por punzonamiento inducida por flexión (Peiris and Ghali
                                                           2012).

                                                           La fisuración inclinada se desarrolla dentro del espesor de
                                                           la losa para una tensión de corte de aproximadamente
                                                           0,17 s  √f´c . Para tensiones de corte mayores, la
                                                           posibilidad de una falla por punzonamiento en la losa
                                                           inducida por flexión aumenta si As,min no se cumple.
                                                           As,min se desarrolló para una columna interior, de tal
                                                           manera que el esfuerzo de corte mayorado en la sección
                                                           crítica para corte iguala al esfuerzo de corte asociado con
                                                           la fluencia local en las caras de la columna.

                                                           Para derivar la ecuación (8.6.1.2) el esfuerzo de corte
                                                           asociado con la fluencia local se tomó como 8As,minfyd /
                                                           bslab para una conexión de columna interior (Hawkins and
                                                           Ospina, 2017) y se generalizó como (s/5)As,minfyd / bslab
                                                           para tener en cuenta las condiciones de borde y esquina.
                                                           Hay necesidad de colocar As,min también en la periferia de
                                                           ábacos y cabezales de corte.

                                                           En los artículos C 22.5.5.1 y C 22.6.5.2 se encuentran
                                                           comentarios sobre el factor de efecto de tamaño.


<a id="c8.6.2"></a>
### 8.6.2 Armadura mínima a flexión en losas                  C 8.6.2. Armadura mínima            a   flexión    en   losas  <sub>p.174</sub>

       pretensadas                                                  pretensadas


<a id="c8.6.2.1"></a>
### 8.6.2.1 Para losas pretensadas, la fuerza de              C 8.6.2.1. El pretensado promedio mínimo efectivo de  <sub>p.174</sub>

pretensado efectiva Apsfse debe proveer una tensión        0,9 MPa fue utilizado en ensayos sobre paneles en dos
de compresión promedio mínima de 0,9 MPa sobre la          direcciones a comienzos de la década de 1970 para
sección de losa tributaria al cordón o grupo de            prevenir fallas al corte por punzonamiento en losas poco
cordones. Para losas con sección transversal               armadas. Por esta razón, el pretensado mínimo efectivo se
variable a lo largo del vano de la losa ya sea en la       requiere en toda sección transversal.
dirección paralela o en la perpendicular al cordón o
grupo de cordones, se requiere un pretensado               Si el espesor de la losa varía a lo largo del vano de una losa
promedio mínimo efectivo de 0,9 MPa en cada                o perpendicularmente a él, produciendo una sección
sección transversal de losa tributaria al cordón o         transversal variable, se requiere cumplir con el pretensado
grupo de cordones a lo largo del vano.                     mínimo efectivo de 0,9 MPa y la separación máxima de
                                                           los cordones en toda sección transversal correspondiente al

Reglamento CIRSOC 201-25                                                                                     Cap. 8 - 142


<!-- page 174 -->

                          REGLAMENTO                                                             COMENTARIO

                                                                            cordón o grupo de cordones a lo largo del vano,
                                                                            considerando las secciones más gruesas o más delgadas de
                                                                            la losa. Debe tenerse en cuenta que esto puede llevar a un
                                                                            fpc mayor que el mínimo en las secciones transversales
                                                                            más delgadas o cuando se usan cordones con separaciones
                                                                            menores que el máximo en secciones más gruesas a lo
                                                                            largo de un vano con sección variable, debido a los
                                                                            aspectos prácticos de la colocación de los cordones en
                                                                            obra.

8.6.2.2. Para losas con armadura de pretensado                              C 8.6.2.2. Este requisito constituye una precaución frente
adherente, la cantidad total de As y Aps debe ser la                        a fallas abruptas a flexión inmediatamente después de la
adecuada para desarrollar una carga mayorada de al                          fisuración. Un elemento a flexión, diseñado de acuerdo con
menos 1,2 veces la carga de fisuración, calculada                           los requisitos del Reglamento, requiere una carga adicional
con base en fr definido en el artículo 19.2.3.                              considerable más allá de la de fisuración para alcanzar su
                                                                            resistencia a flexión. Por esta razón, una flecha
                                                                            considerable advierte que el elemento se está aproximando
                                                                            a su límite de resistencia. Si la resistencia a la flexión se
                                                                            alcanzara poco después de la fisuración, esta flecha de
                                                                            advertencia podría no ocurrir. La transferencia de fuerza
                                                                            entre el hormigón y la armadura de pretensado, y una falla
                                                                            abrupta a flexión inmediatamente después de la fisuración,
                                                                            no ocurren cuando la armadura de pretensado no tenga
                                                                            adherencia (Para más información referirse al ACI
                                                                            423.3R); por lo tanto, este requisito no aplica a elementos
                                                                            con cordones no adherentes.


<a id="c8.6.2.2.1"></a>
### 8.6.2.2.1 En losas con resistencia de cálculo a  <sub>p.175</sub>

flexión y corte de al menos el doble de la resistencia
requerida se permite omitir el cumplimiento del
artículo 8.6.2.2.

8.6.2.3. En losas pretensadas, se debe colocar un                           C 8.6.2.3. El Reglamento requiere que se coloque alguna
área mínima de armadura longitudinal conformada                             armadura adherente en losas pretensadas con el fin de
adherente, As,min en la zona de tracción                                    limitar el ancho y separación de las fisuras para cargas de
precomprimida en la dirección de la luz bajo                                servicio cuando las tensiones de tracción exceden el
consideración de acuerdo con la Tabla 8.6.2.3.                              módulo de ruptura y, para losas con cordones no
                                                                            adherentes, para garantizar un comportamiento a flexión
                                                                            para resistencia nominal y no un comportamiento como
Tabla 8.6.2.3. Área    mínima   de   armadura                               arco atirantado. La colocación de una armadura mínima
longitudinal conformada adherente, As,min , en                              adherente, tal como se especifica en este requisito, ayuda a
                                                                            garantizar un comportamiento adecuado.
losas en dos direcciones con cordones adheren-
tes y no adherentes
                                                                            La cantidad mínima de armadura adherentes para losas
                                                                            planas en dos direcciones está basada en los informes del
               ft calculado después                                         Joint ACI-ASCE Committee 423 (1958) y ACI 423.3R.
                                              As,min
      Zona      de considerar todas                                         Las investigaciones limitadas disponibles para losas planas
                                               mm2
                 las pérdidas, MPa                                          en dos direcciones con ábacos (Odello and Mehta 1967)
                                               No se                        indican que el comportamiento de estos sistemas en
                     ft ≤ 0,17 √f´c           requiere
                                                                (a)
Momento                                                                     particular es semejante al comportamiento de placas
positivo                                        Nc                          planas.
                0,17 √f´c ≤ ft ≤ 0,5 √f´c                    (b) [1], [2]
                                               0,5 fy
 Momento                                                                    Para cargas y luces usuales, los ensayos de placas planas
 negativo
    en la             ft ≤ 0,5 √f´c       0,00075 Acf         (c) [2]       resumidos en Joint ACI-ASCE Committee 423 (1958) y la
 columna                                                                    experiencia acumulada desde que se adoptó el Reglamento
[1]
      El valor de fy no debe exceder 420 MPa.                               de 1963, indican un comportamiento satisfactorio en zonas
[2]
       Para losas con cordones adherentes, se puede reducir As,min          de momentos positivo sin armadura adherente donde
       en una cantidad igual al área de armadura de pretensado               ft ≤ 0,17 √f´c . En zonas de momento positivo, donde
       adherente localizada dentro del área utilizada para calcular Nc       0,17 √f´c ≤ ft ≤ 0,5 √f´c , se requiere un área mínima de
       para momento positivo, o dentro del ancho de losa definido en
       el artículo 8.7.5.3(a) para momento negativo.                        armadura adherente capaz de resistir Nc de acuerdo con la
                                                                            ecuación (8.6.2.3(b)). La fuerza de tracción Nc se calcula


<!-- page 175 -->

                   REGLAMENTO                                               COMENTARIO

                                                       al nivel de cargas de servicio con base en una sección
                                                       homogénea no fisurada.

                                                       Las investigaciones sobre losas planas en dos direcciones,
                                                       postesadas con cordones no adherentes (Joint ACI-ASCE
                                                       Committee 423 1958, 1974; ACI 423.3R; Odello and
                                                       Mehta 1967) muestran que la armadura adherente en las
                                                       regiones de momento negativo, diseñada con base en una
                                                       cuantía de 0,075 % calculada sobre la sección transversal
                                                       de la faja losa-viga, aporta suficiente ductilidad y reduce la
                                                       separación y ancho de fisuras. La misma área de armadura
                                                       adherente se requiere en losas tanto con cordones
                                                       adherentes como no adherentes. El área mínima de
                                                       armadura adherente requerida por la ecuación (8.6.2.3(c))
                                                       corresponde a un área mínima independiente de la
                                                       resistencia a la fluencia de diseño. Para tener en cuenta
                                                       vanos tributarios adyacentes diferentes, la ecuación se
                                                       incluye con base en fajas losa-viga como se definen en el
                                                       artículo 2.3. Para paneles de losa rectangulares, esta
                                                       ecuación es conservadora por estar basada en la mayor
                                                       sección transversal de dos fajas losa-viga que se
                                                       intersectan en la columna. Esto asegura que la cuantía
                                                       mínima de acero recomendada por las investigaciones se
                                                       coloque en las dos direcciones. Es importante la
                                                       concentración de esta armadura en la parte superior de la
                                                       losa, directamente sobre la columna e inmediatamente
                                                       adyacente a ella. Las investigaciones demuestran de igual
                                                       manera, que donde se presentan tensiones bajas de tracción
                                                       al nivel de cargas de servicio, se logra también, un
                                                       comportamiento satisfactorio al nivel de cargas mayoradas
                                                       sin armadura adherente. Sin embargo, el Reglamento
                                                       requiere una cantidad mínima de armadura adherente
                                                       independientemente de los niveles de tensión para las
                                                       cargas de servicio con el fin de ayudar a mejorar la
                                                       continuidad y ductilidad en flexión, y para limitar el ancho
                                                       de las fisuras y su separación debido a sobrecargas,
                                                       variación de temperatura o contracción. Investigaciones
                                                       sobre conexiones entre placas planas postesadas y
                                                       columnas se presentan en Smith and Burns (1974), Burns
                                                       and Hemakom (1977), Hawkins (1981), PTI TAB.1, and
                                                       Foutch et al. (1990).


<a id="c8.7"></a>
### 8.7 DETALLADO DE LA ARMADURA                          C 8.7. DETALLADO DE LA ARMADURA  <sub>p.176</sub>



<a id="c8.7.1"></a>
### 8.7.1 Generalidades  <sub>p.176</sub>



<a id="c8.7.1.1"></a>
### 8.7.1.1 El recubrimiento de hormigón de la armadura  <sub>p.176</sub>

debe cumplir con el artículo 20.5.1.


<a id="c8.7.1.2"></a>
### 8.7.1.2 Las longitudes de anclaje de la armadura  <sub>p.176</sub>

conformada y pretensada deben cumplir con el
artículo 25.4.


<a id="c8.7.1.3"></a>
### 8.7.1.3 Las longitudes de empalme de la armadura  <sub>p.176</sub>

conformada deben cumplir el artículo 25.5.


<a id="c8.7.1.4"></a>
### 8.7.1.4 Los paquetes de barras se deben detallar de  <sub>p.176</sub>

acuerdo con el artículo 25.6.

Reglamento CIRSOC 201-25                                                                                 Cap. 8 - 144


<!-- page 176 -->

                    REGLAMENTO                                                      COMENTARIO


<a id="c8.7.2"></a>
### 8.7.2 Separación de la armadura para flexión                   C 8.7.2. Separación de la armadura para flexión  <sub>p.177</sub>



<a id="c8.7.2.1"></a>
### 8.7.2.1 La separación mínima s debe cumplir con el  <sub>p.177</sub>

artículo 25.2.


<a id="c8.7.2.2"></a>
### 8.7.2.2 Para losas macizas no pretensadas, la                  C 8.7.2.2. El requisito de que la separación medida centro  <sub>p.177</sub>

separación máxima s de la armadura longitudinal                 a centro de la armadura no sea mayor que dos veces el
conformada debe ser el menor de entre 2h y 300 mm               espesor de la losa, 2h, se aplica únicamente a la armadura
en las secciones críticas, y el menor entre 3h y                de losas macizas, y no a viguetas o losas nervadas o
300 mm en las otras secciones.                                  reticulares. Esta limitación pretende asegurar la acción de
                                                                losa, reducir la fisuración y tener en cuenta la posible
                                                                existencia de cargas concentradas en áreas pequeñas de la
                                                                losa. Ver también el artículo C 24.3.


<a id="c8.7.2.3"></a>
### 8.7.2.3 Para losas pretensadas con cargas                      C 8.7.2.3. Este artículo aporta una guía específica  <sub>p.177</sub>

uniformemente distribuidas, la separación máxima s              respecto a la distribución de cordones, la cual permite el
de los cordones o grupos de cordones en al menos                empleo de una distribución en banda de los cordones en
una dirección debe ser el menor de entre 8h y 1,5 m.            una dirección. Mediante investigaciones estructurales
                                                                (Burns and Hemakom, 1977) se ha demostrado que este
                                                                método de distribución de cordones tiene comportamiento
                                                                satisfactorio.


<a id="c8.7.2.4"></a>
### 8.7.2.4 Se deben considerar las cargas concentra-  <sub>p.177</sub>

das y las aberturas en las losas al determinar la
separación de los cordones.


<a id="c8.7.3"></a>
### 8.7.3 Restricciones en las esquinas de las losas               C 8.7.3. Restricciones en las esquinas de las losas  <sub>p.177</sub>



<a id="c8.7.3.1"></a>
### 8.7.3.1 En las esquinas exteriores de las losas                C 8.7.3.1. Las esquinas no restringidas de losas de dos  <sub>p.177</sub>

apoyadas sobre tabiques en el borde o donde una o               direcciones tienden a levantarse al ser cargadas. Si esta
más vigas de borde tengan un valor de f mayor de               tendencia a levantarse es restringida por tabiques o vigas
1,0, debe colocarse armadura, tanto en la parte                 de borde, se producen momentos de flexión en la losa. Esta
inferior como en la superior de la losa para resistir un        sección requiere la colocación de una armadura para
Mu por unidad de ancho igual al momento positivo                resistir estos momentos y controlar la fisuración. Para
máximo Mu por unidad de ancho del panel de la losa.             satisfacer estos requisitos, se puede usar la armadura de
                                                                flexión en las direcciones principales. Ver Figura
                                                                C 8.7.3.1.

<a id="c8.7.3.1.1"></a>
### 8.7.3.1.1 Debe suponerse que el momento  <sub>p.177</sub>

mayorado debido a los efectos de esquina, Mu ,
actúa alrededor de un eje perpendicular a la diagonal
que parte de la esquina en la parte superior, y
alrededor de un eje paralelo a la diagonal que parte
de la esquina en la parte inferior de la losa.


<a id="c8.7.3.1.2"></a>
### 8.7.3.1.2 La armadura debe colocarse a partir de la  <sub>p.177</sub>

esquina por una distancia en cada dirección igual a
un quinto de la longitud de la luz más grande.


<a id="c8.7.3.1.3"></a>
### 8.7.3.1.3 La armadura debe colocarse paralelamente  <sub>p.177</sub>

a la diagonal en la parte superior de la losa, y
perpendicularmente a la diagonal en la parte inferior
de la losa. Alternativamente, la armadura debe
colocarse en dos capas paralelas a los bordes de la
losa tanto en la parte superior como en la parte
inferior de la losa.


<!-- page 177 -->

                   REGLAMENTO                                                COMENTARIO

                                                         Figura C 8.7.3.1. Armadura de esquina en la losa.


<a id="c8.7.4"></a>
### 8.7.4 Armadura para flexión en losas no preten-         C 8.7.4. Armadura para flexión en losas no pretensadas  <sub>p.178</sub>

       sadas


<a id="c8.7.4.1"></a>
### 8.7.4.1 Terminación de la armadura                      C 8.7.4.1. Terminación de la armadura  <sub>p.178</sub>



<a id="c8.7.4.1.1"></a>
### 8.7.4.1.1 Donde la losa esté apoyada sobre vigas        C 8.7.4.1.1 y C 8.7.4.1.2. Los momentos de flexión de las  <sub>p.178</sub>

dintel, columnas o tabiques perimetrales, el anclaje     losas en la unión con las vigas dintel pueden variar
de la armadura perpendicular al borde discontinuo        significativamente. Si las vigas dintel se construyen
debe cumplir con (a) y (b):                              monolíticamente con tabiques, la losa está prácticamente
                                                         empotrada. Si no existe un tabique construido
(a) La armadura para momento positivo debe               monolíticamente, la losa tiende a estar simplemente
    prolongarse hasta el borde de la losa y tener una    apoyada, dependiendo de la rigidez a torsión de la viga
    longitud embebida recta o en gancho, de por lo       dintel o del borde de la losa. Estos requisitos previenen
    menos 150 mm en las vigas dintel, columnas o         condiciones desconocidas que pueden ocurrir normalmente
    tabiques perimetrales.                               en una estructura.

(b) La armadura para momento negativo debe
    doblarse, formar ganchos o anclarse en las vigas
    dintel, tabiques perimetrales o columnas, para
    que desarrolle su capacidad a tracción en la cara
    del apoyo.


<a id="c8.7.4.1.2"></a>
### 8.7.4.1.2 Cuando la losa no esté apoyada en una  <sub>p.178</sub>

viga dintel o tabique en un borde discontinuo, o
cuando la losa se prolongue en voladizo más allá del
apoyo, se permite el anclaje de la armadura dentro
de la losa.


<a id="c8.7.4.1.3"></a>
### 8.7.4.1.3 Para losas sin vigas, las extensiones de la   C 8.7.4.1.3. Las longitudes y extensiones mínimas de la  <sub>p.178</sub>

armadura deben cumplir con (a) hasta (c):                armadura expresadas como una fracción de la luz libre en
                                                         la Figura 8.7.4.1.3 se desarrollaron para losas de dimen-

Reglamento CIRSOC 201-25                                                                               Cap. 8 - 146


<!-- page 178 -->

                    REGLAMENTO                                                       COMENTARIO

(a) Las longitudes de la armadura deben tener las               siones normales que resisten cargas gravitacionales. Estas
    extensiones mínimas prescritas en la Figura                 longitudes y extensiones mínimas pueden ser insuficientes
    8.7.4.1.3, y si la losa actúa como elemento                 para interceptar fisuras potenciales de corte por
    principal para resistir las fuerzas laterales, las          punzonamiento en losas en dos direcciones gruesas como
    longitudes de la armadura deben ser al menos                pueden ser las losas de transferencia, losas de podios, y
    aquellas requeridas por el análisis.                        plateas de fundación. Por esta razón, el Reglamento
                                                                requiere extensiones de por lo menos la mitad de las barras
(b) Cuando las luces adyacentes no sean iguales, la             superiores de la faja de columna de por lo menos 5d. Para
    prolongación de la armadura para momento                    losas con ábacos, d es el espesor efectivo dentro del ábaco.
    negativo más allá de la cara de apoyo, como se              En estas losas gruesas en dos direcciones es deseable
    prescribe en la Figura 8.7.4.1.3, debe basarse              colocar armadura continua en cada dirección cerca de
    en la luz mayor.                                            ambas caras para mejorar la integridad estructural, el
                                                                control de la fisuración y reducir las flechas por fluencia
(c) Se permiten barras dobladas únicamente                      lenta.
    cuando la relación entre la altura y la luz permita
    el uso de dobleces de 45° o menos.                          Tal como se ilustra en la Figura C 8.7.4.1.3, las fisuras de
                                                                corte por punzonamiento que pueden desarrollarse con
                                                                ángulos tan bajos como aproximadamente 20°, pueden no
                                                                ser interceptadas por la armadura a tracción, en losas
                                                                gruesas si esta armadura no se extiende al menos 5d más
                                                                allá de la cara del apoyo. El requisito de la extensión de 5d
                                                                gobierna cuando n / h es menor de aproximadamente 15.
                                                                Para los momentos resultantes de la combinación de cargas
                                                                laterales y gravitacionales, estas longitudes y extensiones
                                                                mínimas pueden resultar insuficientes.

                                                                Rara vez se usan barras dobladas porque son difíciles de
                                                                colocar apropiadamente. Se permiten, sin embargo, barras
                                                                dobladas si cumplen con el artículo 8.7.4.1.3(c).

                                                                Figura C 8.7.4.1.3. Fisuras de corte por punzonamiento
                                                                en losas normales y gruesas.


<!-- page 179 -->

                   REGLAMENTO                                                 COMENTARIO

Figura 8.7.4.1.3. Extensiones mínimas de la arma-
dura conformada en losas en dos direcciones sin
vigas.


<a id="c8.7.4.2"></a>
### 8.7.4.2 Integridad estructural                           C 8.7.4.2. Integridad estructural  <sub>p.180</sub>



<a id="c8.7.4.2.1"></a>
### 8.7.4.2.1 Todas las barras conformadas o mallas          C 8.7.4.2.1 y C 8.7.4.2.2. La armadura inferior continua de  <sub>p.180</sub>

inferiores dentro de la faja de columna, en cada          la faja de columna, aporta a la losa cierta capacidad
dirección, deben ser continuas o estar empalmadas         residual de quedar suspendida de los apoyos adyacentes si
con empalmes mecánicos o soldados de acuerdo              un apoyo se daña. Las dos barras inferiores continuas de la
con el artículo 25.5.7 o empalmes a tracción Clase B      faja de columna pueden denominarse “armadura de
de acuerdo con el artículo 25.5.2. Los empalmes           integridad”, y se colocan para dar a la losa alguna
deben ubicarse como lo muestra la Figura 8.7.4.1.3.       capacidad residual después de una falla local de corte por
                                                          punzonamiento de un apoyo (Mitchell and Cook 1984).
                                                          Hasta tanto se emita un documento al respecto, el lector
                                                          puede consultar el ACI 352.1R quien aporta una guía de
                                                          diseño de la armadura de integridad para conexiones losa-
                                                          columna. En el artículo 8.7.5.6 se presentan requisitos
                                                          análogos para las losas con cordones no adherentes.


<a id="c8.7.4.2.2"></a>
### 8.7.4.2.2 Al menos dos barras inferiores de la faja de  <sub>p.180</sub>

columna, en cada dirección, deben pasar a través de
la región circunscrita por la armadura longitudinal de
la columna y deben anclarse en los apoyos
exteriores.


<a id="c8.7.5"></a>
### 8.7.5 Armadura a flexión en losas pretensadas            C 8.7.5. Armadura a flexión en losas pretensadas  <sub>p.180</sub>



<a id="c8.7.5.1"></a>
### 8.7.5.1 Los cordones externos deben conectarse a  <sub>p.180</sub>


Reglamento CIRSOC 201-25                                                                                 Cap. 8 - 148


<!-- page 180 -->

                    REGLAMENTO                                                       COMENTARIO

cidad especificada entre los cordones y el centro de
gravedad del hormigón para todo el rango de flechas
previstas para el elemento.


<a id="c8.7.5.2"></a>
### 8.7.5.2 Cuando se requiera armadura longitudinal               C 8.7.5.2. La armadura adherente debería estar  <sub>p.181</sub>

conformada adherente para cumplir los requisitos de             adecuadamente anclada para que desarrolle la resistencia
resistencia a flexión o las condiciones de tensión de           requerida para resistir las cargas mayoradas. Los requisitos
tracción, de acuerdo con la ecuación (8.6.2.3(b)), se           del artículo 7.7.3 llevan a que la armadura adherente que se
deben cumplir los requisitos de detallado del artículo          requiere para resistencia a flexión bajo cargas mayoradas
7.7.3.                                                          de acuerdo con el artículo 22.3.2, o para condiciones de
                                                                tensión de tracción a nivel de cargas de servicio, de
                                                                acuerdo con la ecuación (8.6.2.3(b)), esté anclada de
                                                                manera adecuada con el fin de desarrollar las fuerzas de
                                                                tracción o de compresión.


<a id="c8.7.5.3"></a>
### 8.7.5.3 La armadura longitudinal conformada adhe-  <sub>p.181</sub>

rente requerida por la ecuación (8.6.2.3(c)) debe
colocarse en la parte superior de la losa y debe
cumplir con (a) hasta (c):

(a) La armadura debe distribuirse entre líneas que
    están 1,5h afuera de las caras opuestas de la
    columna de apoyo.

(b) Deben colocarse por lo menos cuatro barras
    conformadas, mallas soldadas o cordones
    adherentes en cada dirección.

(c) La separación máxima s entre armadura longitu-
    dinal adherente no debe exceder 300 mm.


<a id="c8.7.5.4"></a>
### 8.7.5.4 Terminación de la armadura de preten-  <sub>p.181</sub>

         sado


<a id="c8.7.5.4.1"></a>
### 8.7.5.4.1 Las zonas de anclajes de postesado deben  <sub>p.181</sub>

calcularse y detallarse de acuerdo con el artículo
25.9.


<a id="c8.7.5.4.2"></a>
### 8.7.5.4.2 Los anclajes y conectores de postesado  <sub>p.181</sub>

deben calcularse y detallarse de acuerdo con el
artículo 25.8.


<a id="c8.7.5.5"></a>
### 8.7.5.5 Terminación de la armadura conformada                  C 8.7.5.5. Terminación de la armadura conformada  <sub>p.181</sub>

         en losas con cordones no adherentes                               en losas con cordones no adherentes


<a id="c8.7.5.5.1"></a>
### 8.7.5.5.1 La longitud de la armadura conformada                C 8.7.5.5.1. Las longitudes mínimas aplican para la  <sub>p.181</sub>

requerida en el artículo 8.6.2.3 debe cumplir con (a) y         armadura conformada requerida por el artículo 8.6.2.3,
(b):                                                            pero que no se requiere para resistencia a flexión de
                                                                acuerdo con el artículo 22.3.2. Investigación (Odello and
(a) En zonas de momento positivo, la longitud de la             Mehta 1967) sobre luces continuas muestra que estas
    armadura debe ser al menos n / 3 y estar centra-           longitudes mínimas conducen a un comportamiento
    da en aquellas zonas.                                       adecuado bajo cargas de servicio y condiciones de carga
                                                                mayorada.
(b) En zonas de momento negativo, la armadura
    debe prolongarse al menos n / 6 a cada lado de
    la cara de apoyo.


<a id="c8.7.5.6"></a>
### 8.7.5.6 Integridad estructural                                 C 8.7.5.6. Integridad estructural  <sub>p.181</sub>



<a id="c8.7.5.6.1"></a>
### 8.7.5.6.1 Excepto lo permitido en el artículo                  C 8.7.5.6.1. Los cordones de pretensado que pasan a  <sub>p.181</sub>

8.7.5.6.3, se debe colocar como mínimo 2 cordones,              través del nudo losa-columna en cualquier ubicación


<!-- page 181 -->

                        REGLAMENTO                                            COMENTARIO

con cordón de al menos 12,7 mm de diámetro, sobre         dentro del espesor de la losa permiten que la losa se
las columnas en cada dirección de acuerdo con (a) o       cuelgue después de la falla de corte por punzonamiento,
(b):                                                      siempre que los cordones sean continuos o se encuentren
                                                          anclados dentro de la región circunscrita por la armadura
(a) Los cordones deben pasar a través de la región        longitudinal de la columna y se haya evitado que
    circunscrita por la armadura longitudinal de la       produzcan un estallido de la superficie superior de la losa
    columna.                                              (ACI 352.1R).

(b) Los cordones deben anclarse dentro de la región
    circunscrita por la armadura longitudinal de la
    columna y el anclaje debe colocarse más allá del
    centro de gravedad de la columna y lejos del
    vano anclado.


<a id="c8.7.5.6.2"></a>
### 8.7.5.6.2 Por fuera de las caras exteriores, de la       C 8.7.5.6.2. Por fuera de las caras exteriores, de la  <sub>p.182</sub>

columna o del cabezal de corte, los dos cordones de       columna o del cabezal de corte, los cordones de integridad
integridad estructural requeridos por el artículo         estructural deberían pasar debajo de los cordones
8.7.5.6.1 deben pasar bajo cualquier cordón ortogo-       ortogonales de los vanos adyacentes de manera que los
nal en vanos adyacentes.                                  movimientos verticales de los cordones de integridad sean
                                                          restringidos por los cordones ortogonales. Cuando los
                                                          cordones se encuentran distribuidos en una dirección y
                                                          distribuidos en banda en la dirección ortogonal, se puede
                                                          cumplir este requisito colocando primero los cordones de
                                                          integridad para la dirección de los cordones y luego
                                                          colocando los cordones distribuidos en banda. Donde los
                                                          cordones se distribuyen en ambas direcciones, es necesario
                                                          entrelazar los cordones y puede ser más practico usar los
                                                          criterios del artículo 8.7.5.6.3.


<a id="c8.7.5.6.3"></a>
### 8.7.5.6.3 Se permiten losas con cordones que no          C 8.7.5.6.3. En      algunas    losas   pretensadas,   las  <sub>p.182</sub>

cumplan con el artículo 8.7.5.6.1 siempre que se          restricciones al tendido de cordones hacen difícil colocar
coloque la armadura conformada inferior adherente         los cordones de integridad estructural requeridos en el
en cada dirección, de acuerdo con el artículo             artículo 8.7.5.6.1. En estas situaciones, los cordones de
8.7.5.6.3.1 hasta 8.7.5.6.3.3.                            integridad estructural pueden ser remplazados por barras
                                                          conformadas en la parte inferior (ACI 352.1R).

8.7.5.6.3.1. La armadura conformada mínima en la
parte inferior de la losa, As , en cada dirección, debe
ser la mayor entre (a) y (b). El valor de fy debe estar
limitado a un máximo de 500 MPa:

           0,37 √f´c c2 d
(a) As =                             (8.7.5.6.3.1a)
                   fy

           2,1 c2 d
(b) As =                             (8.7.5.6.3.1b)
              fy

donde c2 se mide en las caras de la columna a través
de la cual pasa la armadura.

8.7.5.6.3.2. La armadura conformada inferior,
calculada en el artículo 8.7.5.6.3.1 debe pasar dentro
de la zona circunscrita por la armadura longitudinal
de la columna y debe anclarse en los apoyos
exteriores.

8.7.5.6.3.3. La armadura conformada inferior debe
anclarse para desarrollar fy más allá de la cara de la
columna o cabezal de corte.

Reglamento CIRSOC 201-25                                                                                 Cap. 8 - 150


<!-- page 182 -->

                     REGLAMENTO                                                      COMENTARIO


<a id="c8.7.6"></a>
### 8.7.6 Armadura de corte – Estribos                             C 8.7.6. Armadura de corte – Estribos  <sub>p.183</sub>



<a id="c8.7.6.1"></a>
### 8.7.6.1 Se permiten como armadura de corte                     C 8.7.6. Las investigaciones (Hawkins, 1974; Broms,  <sub>p.183</sub>

estribos de una rama, estribos en U simples y                   1990; Yamada et al., 1991; Hawkins et al., 1975; ACI
múltiples y estribos cerrados.                                  421.1R) han demostrado que la armadura para corte
                                                                consistente de barras ancladas apropiadamente o estribos

<a id="c8.7.6.2"></a>
### 8.7.6.2 El anclaje y geometría de los estribos deben           de una o varias ramas, o estribos cerrados, puede aumentar  <sub>p.183</sub>

cumplir con el artículo 25.7.1.                                 la resistencia al corte por punzonamiento de las losas. Los
                                                                límites de separaciones dados en el artículo 8.7.6.3

<a id="c8.7.6.3"></a>
### 8.7.6.3 Cuando se utilicen estribos, su ubicación y            corresponden a los detalles de la armadura para corte en  <sub>p.183</sub>

separación deben cumplir con la Tabla 8.7.6.3.                  losas, los cuales han demostrado su efectividad. El artículo
                                                                25.7.1 presenta los requisitos para el anclaje de la
                                                                armadura de corte tipo estribo, los cuales también deberían
Tabla 8.7.6.3. Ubicación del primer estribo y                   ser aplicados a las barras o alambres usados como
límites de la separación                                        armaduras para corte en losas. Es esencial que esta
                                                                armadura para corte esté atada a la armadura longitudinal
                                                                tanto en la parte superior como inferior de la losa, como se
                                            Distancia o
 Dirección de la     Descripción de                             aprecia en los detalles típicos de las Figuras C 8.7.6(a) a
                                            separación
    medición          la medición                               (c). De acuerdo con los requisitos del artículo 25.7.1, el
                                            máxima, mm
                      Distancia desde la                        anclaje de estribos puede ser difícil en losas de altura
                      cara de la columna        d/2             menor a 250 mm. Se ha usado exitosamente armadura para
Perpendicular a la     al primer estribo
cara de la columna
                                                                corte consistente en barras verticales mecánicamente
                       Separación entre
                                                d/2             ancladas en cada extremo por medio de una platina o
                            estribos
                                                                cabezal capaz de desarrollar la resistencia a la fluencia de
                       Separación entre                         las barras (ACI 421.1R).
Paralelo a la cara
de la columna
                     las ramas verticales        2d
                        de los estribos
                                                                En una conexión losa-columna en la cual la transferencia
                                                                de momento sea despreciable, la armadura para corte
                                                                debería ser simétrica alrededor del centro de gravedad de la
                                                                sección crítica (Figuras C 8.7.6(d)). Los límites de
                                                                separación definidos en el artículo 8.7.6.3 también se
                                                                pueden ver en las Figuras C 8.7.6(d) y (e).

                                                                En columnas de borde, o en el caso de conexiones
                                                                interiores donde la transferencia de momento es
                                                                significativa, se recomiendan estribos cerrados con un
                                                                patrón lo más simétrico posible. Aunque las tensiones de
                                                                corte promedio en las caras AD y BC de la columna
                                                                exterior en la Figura C 8.7.6(e) son menores que en la cara
                                                                AB, los estribos cerrados que se extienden desde las caras
                                                                AD y BC aportan una cierta resistencia torsional a lo largo
                                                                del borde de la losa.

                                                                Figura C 8.7.6(a)-(b). Estribos de una o varias ramas
                                                                para armadura de corte en losas.


<!-- page 183 -->

                   REGLAMENTO                     COMENTARIO

                                Figura C 8.7.6(c). Estribos cerrados para armadura de
                                corte en losas.

                                Figura C 8.7.6(d). Disposición de estribos de corte,
                                columna interior.

Reglamento CIRSOC 201-25                                                   Cap. 8 - 152


<!-- page 184 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                Figura C 8.7.6(e). Disposición de estribos de corte,
                                                                columna de borde.


<a id="c8.7.7"></a>
### 8.7.7 Armadura de corte – Pernos con cabeza                    C 8.7.7. Armadura de corte – Pernos con cabeza  <sub>p.185</sub>



<a id="c8.7.7.1"></a>
### 8.7.7.1 Se permite colocar pernos con cabeza                   Usar ensamblajes para pernos con cabeza como armadura  <sub>p.185</sub>

perpendicularmente al plano de la losa como                     de corte en losas requiere especificar el diámetro del fuste
armadura de corte.                                              del perno, la separación de los pernos y la altura de los
                                                                ensamblajes para cada aplicación en particular.

<a id="c8.7.7.1.1"></a>
### 8.7.7.1.1 La altura total del ensamblaje del perno  <sub>p.185</sub>

con cabeza no debe ser menor que el espesor de la               Los ensayos (ACI 421.1R) muestran que los pernos
losa menos la suma de (a) hasta (c):                            verticales anclados mecánicamente lo más cerca posible de
                                                                la parte superior e inferior de la losa son efectivos para
(a) El recubrimiento de hormigón de la armadura                 resistir el corte por punzonamiento. Los límites de toda la
    superior a flexión.                                         altura especificada logran este objetivo y aportan a la vez
                                                                una tolerancia razonable al especificar esa altura como se
(b) El recubrimiento de hormigón en la platina de               muestra en la Figura C 20.5.1.3.6.
    base.
                                                                En comparación con la rama de un estribo con dobleces en
(c) La mitad del diámetro de la barra de la armadura            los extremos, un perno tiene menor deslizamiento, y por lo
    a tracción por flexión.                                     tanto produce fisuras de corte más finas. Este mejor
                                                                comportamiento da como resultado mayores límites para la
                                                                capacidad al corte y separación entre las líneas periféricas
                                                                de los pernos con cabeza. Las distribuciones típicas de los
                                                                pernos con cabeza se aprecian en la Figura C 8.7.7. La
                                                                sección crítica más allá de la armadura de corte en general
                                                                tiene forma poligonal. Las ecuaciones para calcular las
                                                                tensiones de corte en cada sección se dan en ACI 421.1R.


<a id="c8.7.7.1.2"></a>
### 8.7.7.1.2 La ubicación y separación de los pernos              C 8.7.7.1.2. La separación especificada entre las líneas  <sub>p.185</sub>

con cabeza deben cumplir con la Tabla 8.7.7.1.2.                periféricas de la armadura de corte está justificada por
                                                                ensayos (ACI 421.1R). El espacio libre entre las cabezas


<!-- page 185 -->

                      REGLAMENTO                                                          COMENTARIO

                                                                   de los pernos debería ser el adecuado para permitir la
                                                                   colocación de la armadura de flexión.

Tabla 8.7.7.1.2. Ubicación de los pernos con cabeza y límites de separación

  Dirección
                      Descripción de la                                                            Distancia o separación
    de la                                                         Condición
                         medición                                                                       máxima, mm
  medición
                   Distancia entre la cara de la
                   columna y la primera línea
                    periférica de pernos con
                                                                     Todas                                  d/2
 Perpendicular               cabeza
 a la cara de la                                   Losas no pretensadas con      vu ≤  0,5 √f´c            3d/4
    columna        Separación constante entre
                   las líneas periféricas de los   Losas no pretensadas con      vu >  0,5 √f´c            d/2
                        pernos con cabeza
                                                   Losas pretensadas que cumplen con 22.6.5.4               3d/4
                   Separación entre los pernos
  Paralelo a la    con cabeza adyacentes en
   cara de la        la línea perimetral más                         Todas                                  2d
    columna          cercana a la cara de la
                             columna

                                                                   Figura C 8.7.7. Secciones críticas y disposiciones típicas
                                                                   de pernos con cabeza para armadura de corte.

Reglamento CIRSOC 201-25                                                                                           Cap. 8 - 154


<!-- page 186 -->

                    REGLAMENTO                                                      COMENTARIO


<a id="c8.8"></a>
### 8.8 SISTEMA NERVURADO EN DOS DIREC-                          C 8.8. SISTEMA NERVURADO EN DOS DIREC-  <sub>p.187</sub>

       CIONES NO PRETENSADAS                                           CIONES NO PRETENSADAS


<a id="c8.8.1"></a>
### 8.8.1 Generalidades                                            8.8.1. Generalidades  <sub>p.187</sub>



<a id="c8.8.1.1"></a>
### 8.8.1.1 La construcción nervurada no pretensada en             Las limitaciones empíricas de tamaño y de separación para  <sub>p.187</sub>

dos direcciones consiste en una combinación                     la construcción nervurada en dos direcciones no pretensada
monolítica de nervaduras regularmente espaciadas y              se basan en el comportamiento satisfactorio observado en
una losa colocada en la parte superior, diseñadas               el pasado usando encofrados estándar para este tipo de
para actuar en dos direcciones ortogonales.                     construcción. Para la construcción pretensada de este
                                                                sistema, esta sección puede servir de guía.

<a id="c8.8.1.2"></a>
### 8.8.1.2 El ancho de las nervaduras no debe ser  <sub>p.187</sub>

menor de 100 mm en cualquier ubicación en su
altura.


<a id="c8.8.1.3"></a>
### 8.8.1.3 La altura total de las nervaduras no debe ser  <sub>p.187</sub>

mayor de 3,5 veces su ancho mínimo.


<a id="c8.8.1.4"></a>
### 8.8.1.4 La separación libre entre las nervaduras no            C 8.8.1.4. Se requiere un límite para la separación  <sub>p.187</sub>

debe exceder de 750 mm.                                         máxima de las nervaduras debido a los requisitos que
                                                                permiten mayores resistencias al corte y un recubrimiento
                                                                de hormigón menor para la armadura en estos elementos
                                                                repetitivos relativamente pequeños.


<a id="c8.8.1.5"></a>
### 8.8.1.5 Se permite tomar Vc como 1,1 veces los                 C 8.8.1.5. El incremento en la resistencia al corte se  <sub>p.187</sub>

valores calculados en el artículo 22.5.                         justifica por: 1) el comportamiento satisfactorio de
                                                                construcciones con losas nervadas diseñadas con
                                                                resistencias calculadas más altas al corte especificadas en
                                                                anteriores ediciones del Reglamento, las cuales permitían
                                                                tensiones de corte comparables y 2) el potencial de
                                                                redistribución de las sobrecargas locales a los nervios
                                                                adyacentes.


<a id="c8.8.1.6"></a>
### 8.8.1.6 Para la integridad estructural, al menos una  <sub>p.187</sub>

barra de la parte inferior en cada nervadura debe ser
continua y debe anclarse para desarrollar fy en la
cara de los apoyos.


<a id="c8.8.1.7"></a>
### 8.8.1.7 El área de armadura perpendicular a las  <sub>p.187</sub>

nervaduras debe cumplir la resistencia requerida por
flexión, considerando las concentraciones de carga y
debe ser al menos igual a la armadura para
contracción y temperatura requerida en el artículo
24.4.


<a id="c8.8.1.8"></a>
### 8.8.1.8 La construcción de nervaduras en dos  <sub>p.187</sub>

direcciones que no cumplan con las limitaciones de
los artículos 8.8.1.1 hasta 8.8.1.4, deben diseñarse
como losas y vigas.


<a id="c8.8.2"></a>
### 8.8.2 Sistema nervurados con aligeramientos  <sub>p.187</sub>

       estructurales


<a id="c8.8.2.1"></a>
### 8.8.2.1 Cuando se empleen aligeramientos  <sub>p.187</sub>

permanentes cerámicos o de hormigón, que tengan
una resistencia unitaria a la compresión por lo menos
igual al f'c de las nervaduras, se deben aplicar los
artículos 8.8.2.1.1 y 8.8.2.1.2.


<a id="c8.8.2.1.1"></a>
### 8.8.2.1.1 El espesor de la losa de hormigón sobre  <sub>p.187</sub>

los aligeramientos no debe ser menor que 1/12 de la


<!-- page 187 -->

                   REGLAMENTO                             COMENTARIO

distancia libre entre las nervaduras ni menor que
40 mm.


<a id="c8.8.2.1.2"></a>
### 8.8.2.1.2 Se permite incluir la pared vertical del  <sub>p.188</sub>

elemento de aligeramiento que está en contacto con
la nervadura en los cálculos de resistencia al corte y
momento negativo. Ninguna otra parte de los
aligeramientos debe incluirse en los cálculos de
resistencia.


<a id="c8.8.3"></a>
### 8.8.3 Sistema de nervaduras con otros aligera-  <sub>p.188</sub>

       mientos


<a id="c8.8.3.1"></a>
### 8.8.3.1 Cuando se utilicen encofrados removibles o  <sub>p.188</sub>

aligeramientos que no cumplan con el artículo
8.8.2.1, el espesor de la losa superior no debe ser
menor que 1/12 de la distancia libre entre las
nervaduras ni menor que 50 mm.


<a id="c8.9"></a>
### 8.9 CONSTRUCCIÓN DE LOSAS IZADAS  <sub>p.188</sub>



<a id="c8.9.1"></a>
### 8.9.1 En losas construidas con el método de losas  <sub>p.188</sub>

izadas (“lift-slab”) donde no es práctico pasar los
cordones, como indica el artículo 8.7.5.6.1, o las
barras inferiores a través de la columna como lo
requiere el artículo 8.7.4.2 ó 8.7.5.6.3, al menos dos
cordones de postesado o dos barras o alambres
adherentes inferiores, en cada dirección, deben
pasar a través de los ganchos de izado tan cerca de
la columna como sea posible y deben ser continuos o
empalmarse con empalmes mecánicos o soldados
de acuerdo con el artículo 25.5.7 o con empalmes
por yuxtaposición Clase B a tracción de acuerdo con
el artículo 25.5.2. En las columnas exteriores, la
armadura debe anclarse en los ganchos de izado.

Reglamento CIRSOC 201-25                                                     Cap. 8 - 156


<!-- page 188 -->

                     REGLAMENTO                                                     COMENTARIO
