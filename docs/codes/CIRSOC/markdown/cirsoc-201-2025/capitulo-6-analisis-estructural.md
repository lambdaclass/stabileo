# CIRSOC 201 (2025) — CAPÍTULO 6. ANÁLISIS ESTRUCTURAL

> Source: `CIRSOC 201-2025.pdf` · PDF pages 125–148
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c6.1"></a>
### 6.1 ALCANCE                                                    C 6.1. ALCANCE  <sub>p.125</sub>


Los requisitos de este capítulo se aplican a los                Los requisitos de este capítulo aplican a los análisis
métodos de análisis, los modelos analíticos de                  utilizados para determinar los efectos de las cargas para el
elementos y sistemas estructurales, y al cálculo de             diseño.
los efectos producidos por las cargas.
                                                                El artículo 6.2 presenta requisitos generales que son
                                                                aplicables a todos los procedimientos de análisis.

                                                                El artículo 6.2.4 guía al profesional habilitado respecto a
                                                                requisitos específicos de análisis que no se encuentran en
                                                                este capítulo. Los artículos 6.2.4.1 y 6.2.4.2 identifican los
                                                                requisitos de análisis específicos para losas en dos
                                                                direcciones y tabiques.

                                                                El artículo 6.3 presenta las hipótesis de modelado,
                                                                empleadas para establecer el modelo a analizar.

                                                                El artículo 6.4 establece los diferentes requisitos de
                                                                disposición de la sobrecarga que deben considerarse en el
                                                                análisis.

                                                                El artículo 6.5 presenta un método simplificado de análisis
                                                                para vigas continuas y losas en una dirección no
                                                                pretensadas, el cual puede usarse en lugar de un análisis
                                                                más riguroso cuando se cumplen las condiciones
                                                                especificadas.

                                                                El artículo 6.6 contiene requisitos para un análisis
                                                                completo de primer orden linealmente elástico. En el
                                                                análisis se incluyen los efectos de la fisuración y la
                                                                fluencia lenta por medio del uso de rigideces efectivas.

                                                                El artículo 6.7 incluye requisitos para análisis linealmente
                                                                elástico de segundo orden. Se requiere incluir los efectos
                                                                de la fluencia lenta y la fisuración.

                                                                El artículo 6.8 incluye requisitos para análisis inelástico.

                                                                El artículo 6.9 incluye los requisitos para el uso del método
                                                                de elementos finitos.


<a id="c6.2"></a>
### 6.2 GENERALIDADES                                              C 6.2. GENERALIDADES  <sub>p.125</sub>



<a id="c6.2.1"></a>
### 6.2.1 Se permite modelar matemáticamente los  <sub>p.125</sub>

elementos y sistemas estructurales de acuerdo con
el artículo 6.3.


<a id="c6.2.2"></a>
### 6.2.2 Todos los elementos y sistemas estructurales  <sub>p.125</sub>

deben analizarse para determinar los efectos
máximos producidos por las cargas, incluyendo las
diferentes disposiciones de la sobrecarga de acuerdo
con el artículo 6.4.


<a id="c6.2.3"></a>
### 6.2.3 Los métodos de análisis permitidos por este              C 6.2.3. El análisis de primer orden satisface las  <sub>p.125</sub>

capítulo comprenden de (a) hasta (e):                           ecuaciones de equilibrio utilizando la geometría de la
                                                                estructura no deformada. Cuando se consideran solamente
                                                                los resultados de un análisis de primer orden no se están


<!-- page 125 -->

                   REGLAMENTO                                                    COMENTARIO

(a) El método simplificado para el análisis de vigas        teniendo en cuenta los efectos de esbeltez. Debido a que
    continuas y losas en una dirección con cargas           estos efectos pueden ser importantes, el artículo 6.6
    gravitacionales del artículo 6.5.                       presenta procedimientos para calcular tanto los efectos de
                                                            esbeltez (P) de los elementos individuales, así como los
(b) Análisis lineal elástico de primer orden del            efectos del desplazamiento lateral de toda la estructura
    artículo 6.6.                                           (P) empleando los resultados del análisis de primer
                                                            orden.
(c) Análisis lineal elástico de segundo orden del
    artículo 6.7.                                           Un análisis de segundo orden satisface las ecuaciones de
                                                            equilibrio utilizando la geometría de la estructura
(d) Análisis inelástico del artículo 6.8.                   deformada. Cuando el análisis de segundo orden emplea
                                                            nodos a lo largo de los elementos a compresión, el análisis
(e) Análisis con elementos finitos del artículo 6.9.        tiene en cuenta tanto los efectos de esbeltez debidos a los
                                                            desplazamientos laterales a lo largo del elemento como los
                                                            debidos al desplazamiento lateral de toda la estructura.
                                                            Cuando el análisis de segundo orden emplea solamente
                                                            nodos en la intersección de los elementos, el análisis tiene
                                                            en cuenta los efectos del desplazamiento lateral de toda la
                                                            estructura, pero ignora los efectos de esbeltez de los
                                                            elementos individuales. En este caso, se emplea el método
                                                            de amplificación de momentos (artículo 6.6.4) para
                                                            determinar los efectos de la esbeltez de los elementos
                                                            individuales.

                                                            Un análisis inelástico i) representa la relación no lineal
                                                            entre tensiones y deformaciones unitarias de los materiales
                                                            que componen la estructura, ii) satisface la compatibilidad
                                                            de deformaciones, y iii) satisface el equilibrio en la
                                                            configuración no deformada para análisis de primer orden
                                                            o en la configuración deformada para análisis de segundo
                                                            orden.

                                                            El análisis utilizando elementos finitos se introdujo para
                                                            reconocer explícitamente un método de análisis utilizado
                                                            ampliamente.


<a id="c6.2.4"></a>
### 6.2.4 Los métodos de análisis adicionales permitidos  <sub>p.126</sub>

incluyen desde el artículo 6.2.4.1 hasta el 6.2.4.4.


<a id="c6.2.4.1"></a>
### 6.2.4.1 Para losas en dos direcciones, se permite el       C 6.2.4.1. La edición previa de este Reglamento contenía  <sub>p.126</sub>

análisis para cargas gravitacionales de acuerdo con         requisitos para el uso del método de diseño directo y el
(a) o (b):                                                  método del pórtico equivalente. Estos métodos están bien
                                                            fundamentados y están cubiertos en libros de texto
(a) Método de diseño directo para            losas     no   disponibles. Estos requisitos para análisis de cargas
    pretensadas.                                            gravitacionales de sistemas de losas en dos direcciones se
                                                            han retirado del Reglamento debido a que se consideran
(b) Método del pórtico equivalente para losas no            que son solo dos de los varios métodos de análisis que se
    pretensadas y pretensadas.                              utilizan actualmente en diseño de losas en dos direcciones.
                                                            El método de diseño directo y el método del pórtico
                                                            equivalente del Reglamento del 2005 pueden, no obstante,
                                                            ser utilizados todavía para el análisis de losas en dos
                                                            direcciones para cargas gravitacionales.


<a id="c6.2.4.2"></a>
### 6.2.4.2 Se permite analizar los tabiques esbeltos  <sub>p.126</sub>

para efectos fuera del plano de acuerdo con el
artículo 11.8.


<a id="c6.2.4.3"></a>
### 6.2.4.3 Los diafragmas se pueden analizar de  <sub>p.126</sub>

acuerdo con el artículo 12.4.2.


<a id="c6.2.4.4"></a>
### 6.2.4.4 Se permite analizar un elemento o región  <sub>p.126</sub>

usando el método puntal-tensor de acuerdo con los

Reglamento CIRSOC 201-25                                                                                     Cap. 6 - 94


<!-- page 126 -->

                    REGLAMENTO                                                       COMENTARIO

requisitos del Capítulo 23.


<a id="c6.2.5"></a>
### 6.2.5 Efectos de esbeltez                                      C 6.2.5. Efectos de esbeltez  <sub>p.127</sub>



<a id="c6.2.5.1"></a>
### 6.2.5.1 Se permite ignorar los efectos de esbeltez             En muchas estructuras, los efectos de segundo orden son  <sub>p.127</sub>

siempre que se cumpla (a) o (b):                                despreciables. En estos casos, no es necesario considerar
                                                                los efectos de la esbeltez y se pueden diseñar los elementos
(a) Para   columnas     no    arriostradas          contra      sometidos a compresión tales como columnas, muros o
    desplazamientos laterales                                   arriostramientos, considerando las fuerzas determinadas
                                                                por medio de un análisis de primer orden. Los efectos de la
      k u                                                      esbeltez pueden ser ignorados tanto en los sistemas
           ≤ 22                              (6.2.5.1a)         arriostrados como en los no arriostrados dependiendo de la
       r
                                                                relación de esbeltez (k∙u / r) del elemento.
(b) Para     columnas        arriostradas            contra
    desplazamientos laterales                                   La convención de signos para M1 / M2 ha sido actualizada
      k u            M1                                        de tal manera que M1 / M2 es negativa si el elemento está
           ≤ 34 + 12 ( )                      (6.2.5.1b)        deformado en curvatura simple y positiva si lo está en
       r              M2
                                                                doble curvatura. Lo anterior corresponde a un cambio
                                                                respecto a la convención de signos del Reglamento del
      y
                                                                2005.
      k u
           ≤ 40                              (6.2.5.1c)         La principal ayuda de diseño para estimar el factor de
       r                                                        longitud efectiva k son los Ábacos de Alineamiento de
                                                                Jackson y Moreland (Figura C 6.2.5.1) los cuales permiten
donde M1 / M2 es negativo si la columna presenta
                                                                la determinación gráfica de k para una columna de sección
curvatura simple y positivo si presenta doble                   transversal constante en un pórtico de varios vanos (ACI
curvatura.                                                      SP-17(09); Column Research Council, 1966).
Cuando los elementos de arriostramiento de un piso              Las ecuaciones (6.2.5.1b) y 6.2.5.1c) se basan en la
tienen una rigidez total de al menos 12 veces la                ecuación (6.6.4.5.1) suponiendo que un incremento del 5
rigidez lateral bruta de las columnas en la dirección           % en los momentos debido a la esbeltez es aceptable
considerada se permite considerar que las columnas              (MacGregor et al., 1970). Como primera aproximación, k
del piso están arriostradas contra desplazamientos              puede ser igual a 1,0 en las ecuaciones (6.2.5.1b) y
laterales.                                                      (6.2.5.1c).

                                                                La rigidez del arriostramiento lateral se considera según las
                                                                direcciones principales del sistema estructural. Los
                                                                elementos de arriostramiento en las estructuras típicas
                                                                constan de tabiques estructurales o arriostramientos
                                                                laterales. La respuesta torsional del sistema resistente ante
                                                                fuerzas laterales debido a la excentricidad del sistema
                                                                estructural puede incrementar los efectos de segundo orden
                                                                y debería ser considerada.


<a id="c6.2.5.2"></a>
### 6.2.5.2 Se puede calcular el radio de giro, r , usando  <sub>p.127</sub>

(a), (b), o (c):

              Ig
(a)       r=√                                 (6.2.5.2)
             Ag

(b) 0,30 veces la dimensión de la sección en la
    dirección en la cual se está considerando la
    estabilidad para columnas rectangulares.

(c) 0,25 veces el diámetro de las columnas
    circulares.


<!-- page 127 -->

                   REGLAMENTO                                                  COMENTARIO

                                  Figura C 6.2.5.1. Factor de longitud efectiva k.


<a id="c6.2.5.3"></a>
### 6.2.5.3 A menos que los efectos de esbeltez se           C 6.2.5.3. El diseño con efectos de segundo orden puede  <sub>p.128</sub>

desprecien de acuerdo con el artículo 6.2.5.1, el         basarse ya sea en el procedimiento de amplificación de
diseño de columnas, vigas de arriostramiento y otros      momento (MacGregor et al., 1970; MacGregor, 1993; Ford
elementos que den soporte lateral, debe basarse en        et al., 1981), en un análisis elástico de segundo orden, o en
las fuerzas y momentos amplificados teniendo en           un análisis inelástico de segundo orden. La Figura
cuenta los efectos de segundo orden de acuerdo con        C 6.2.5.3 se presenta para ayudar a los proyectistas en la
los artículos 6.6.4, 6.7 ó 6.8. Mu incluyendo los         aplicación de los requisitos de esbeltez del Reglamento.
efectos de segundo orden, no debe exceder 1,4Mu
debido a los efectos de primer orden.                     Los momentos en los extremos de los elementos en
                                                          compresión, tales como columnas, muros o riostras,
                                                          deberían considerarse en el diseño de los elementos a
                                                          flexión adyacentes. En estructuras arriostradas contra el
                                                          desplazamiento lateral, no hay necesidad de considerar los
                                                          efectos de la amplificación de los momentos en los
                                                          extremos en el diseño de las vigas adyacentes. En
                                                          estructuras no arriostradas contra el desplazamiento lateral,
                                                          la amplificación de los momentos en los extremos debería
                                                          tenerse en cuenta en el diseño de los elementos a flexión
                                                          adyacentes.

                                                          Se han desarrollado varios métodos para evaluar los
                                                          efectos de esbeltez en elementos a compresión sometidos a
                                                          flexión biaxial. Una revisión crítica de algunos de estos
                                                          métodos se presenta en Furlong et al. (2004).

                                                          Si el peso de una estructura es alto en relación a su rigidez
                                                          lateral, pueden presentarse efectos P excesivos con
                                                          momentos secundarios      mayores que el 25 % de los

Reglamento CIRSOC 201-25                                                                                    Cap. 6 - 96


<!-- page 128 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                momentos primarios. Los efectos P pueden
                                                                eventualmente presentar singularidad en la solución de las
                                                                ecuaciones de equilibrio, indicando inestabilidad física de
                                                                la estructura (Wilson, 1997). Investigaciones analíticas
                                                                (MacGregor and Hage, 1977) de pórticos de hormigón
                                                                armado indicaron que la probabilidad de falla por
                                                                inestabilidad aumenta rápidamente cuando el índice de
                                                                estabilidad Q, definido en la ecuación (6.6.4.4.1), excede
                                                                0,2, lo cual es equivalente a tener una relación entre
                                                                momentos secundarios y primarios de 1,25. Según el
                                                                ASCE/SEI 7-10, el valor máximo del coeficiente de
                                                                estabilidad  similar al coeficiente de estabilidad Q de este
                                                                Reglamento, es 0,25. Este valor de 0,25 es equivalente a
                                                                una relación entre momentos secundarios y primarios de
                                                                1,33. Por esta razón, se definió un límite superior de 1,4 en
                                                                la relación entre momentos secundarios y primarios.

                Figura C 6.2.5.3. Diagrama de flujo para determinar los efectos de esbeltez en columnas.


<!-- page 129 -->

                   REGLAMENTO                                                COMENTARIO


<a id="c6.3"></a>
### 6.3 HIPÓTESIS PARA DEFINIR EL MODELO                   C 6.3. HIPÓTESIS PARA DEFINIR EL MODELO  <sub>p.130</sub>



<a id="c6.3.1"></a>
### 6.3.1 Generalidades                                    C 6.3.1. Generalidades  <sub>p.130</sub>



<a id="c6.3.1.1"></a>
### 6.3.1.1 Las rigideces relativas de los elementos que   C 6.3.1.1. Pueden realizarse análisis separados con  <sub>p.130</sub>

forman parte del sistema estructural se deben           diferentes hipótesis de rigidez para diferentes objetivos,
seleccionar considerando un conjunto de hipótesis       tales como la comprobación de los criterios de
razonables. Las hipótesis deben ser congruentes a       comportamiento en servicio y de resistencia, o evaluar las
través de cada análisis.                                demandas en elementos donde las hipótesis de rigidez son
                                                        críticas.

                                                        Idealmente, las rigideces del elemento EcI y GJ deberían
                                                        reflejar el grado de fisuración y de acción inelástica que ha
                                                        ocurrido a lo largo de cada elemento inmediatamente antes
                                                        de la fluencia. Sin embargo, las complejidades asociadas
                                                        con la selección de las diferentes rigideces de todos los
                                                        elementos de la estructura, harían ineficientes los análisis
                                                        estructurales durante el proceso de diseño. De allí que se
                                                        requieran hipótesis más sencillas para definir las rigideces
                                                        a flexión y torsión.

                                                        En estructuras arriostradas contra desplazamiento lateral,
                                                        los valores relativos de la rigidez son importantes. En este
                                                        caso, las dos hipótesis más comunes consisten en utilizar
                                                        0,5Ig para las vigas e Ig para las columnas.

                                                        Para estructuras no arriostradas contra desplazamiento
                                                        lateral, es deseable disponer de una estimación realista de I
                                                        y ésta debería utilizarse si se llevan a cabo análisis de
                                                        segundo orden. En el artículo 6.6.3.1 se presentan guías
                                                        para la selección de I en este caso.

                                                        La necesidad incluir la rigidez a torsión está determinada
                                                        por dos condiciones en el análisis de una estructura dada:
                                                        1) la magnitud relativa de las rigideces a torsión y flexión y
                                                        2) si se requiere de torsión para el equilibrio de la
                                                        estructura (torsión de equilibrio), o si ésta es debida a la
                                                        torsión de los elementos con el fin de mantener la
                                                        compatibilidad de las deformaciones (torsión de
                                                        compatibilidad). En el caso de la torsión de equilibrio, la
                                                        rigidez torsional debería incluirse en el análisis. Es
                                                        necesario, por ejemplo, considerar la rigidez torsional de
                                                        las vigas de borde. En el caso de la torsión de compatibili-
                                                        dad, la rigidez a torsión usualmente no se incluye en el
                                                        análisis. Esto se debe a que la rigidez fisurada a torsión de
                                                        una viga es una fracción pequeña de la rigidez a flexión de
                                                        los elementos que llega a la viga. La torsión debería ser
                                                        considerada en el diseño como lo requiere el Capítulo 9.


<a id="c6.3.1.2"></a>
### 6.3.1.2 Para calcular los momentos y cortes debidos  <sub>p.130</sub>

a cargas gravitacionales en columnas, vigas y losas
se permite usar un modelo limitado a los elementos
del nivel en consideración y a las columnas
inmediatamente por encima y por debajo de ese
nivel. En las columnas construidas monolíticamente
con la estructura, sus extremos lejanos pueden
considerarse empotrados.


<a id="c6.3.1.3"></a>
### 6.3.1.3 En el modelo de análisis deben considerarse    C 6.3.1.3. En el documento Portland Cement Association  <sub>p.130</sub>

                                                                            coeficientes de rigidez y de momento

Reglamento CIRSOC 201-25                                                                                   Cap. 6 - 98


<!-- page 130 -->

                     REGLAMENTO                                                      COMENTARIO

sección transversal del elemento, tales como el                 de empotramiento de elementos acartelados.
efecto producido por cartelas.


<a id="c6.3.2"></a>
### 6.3.2 Geometría de las vigas T                                 C 6.3.2. Geometría de las vigas T  <sub>p.131</sub>



<a id="c6.3.2.1"></a>
### 6.3.2.1 En la construcción de vigas T no                       C 6.3.2.1. En el Reglamento CIRSOC 201-05, el ancho  <sub>p.131</sub>

pretensadas, construidas para soportar losas                    de la losa efectivo como ala de la viga T estaba limitado a
monolíticas o compuestas, el ancho efectivo de la               un cuarto de la luz. El Reglamento permite ahora un octavo
losa usada como ala, bf, debe incluir el ancho bw del           de la luz a cada lado del alma de la viga. Esto se hizo para
alma de la viga más un ancho sobresaliente efectivo             simplificar la Tabla 6.3.2.1 y tiene un impacto desprecia-
del ala, de acuerdo con la Tabla 6.3.2.1, donde h es            ble en los diseños.
el espesor de la losa y sw es la distancia libre a la
siguiente alma.

Tabla 6.3.2.1. Límites dimensionales del ancho
sobresaliente del ala para vigas T

                      Ancho sobresaliente efectivo del
 Ubicación del ala
                      ala, más allá de la cara del alma
                                               8h
 A cada lado del alma   El menor de:          sw / 2
                                              n / 8
                                               6h
    A un solo lado      El menor de:          sw / 2
                                              n / 12


<a id="c6.3.2.2"></a>
### 6.3.2.2 En vigas T no pretensadas aisladas, en las  <sub>p.131</sub>

cuales se utilice la forma T para aportar por medio
del ala un área adicional de compresión, el ala debe
tener un espesor mayor o igual a 0,5bw y un ancho
efectivo del ala menor o igual a 4bw.


<a id="c6.3.2.3"></a>
### 6.3.2.3 En vigas T pretensadas, se permite usar la             C 6.3.2.3. Los requisitos empíricos de los artículos  <sub>p.131</sub>

geometría establecida en los artículos 6.3.2.1 y                6.3.2.1 y 6.3.2.2 fueron desarrollados para vigas T no
6.3.2.2.                                                        pretensadas. En lo posible para vigas T pretensadas, debe
                                                                utilizarse el ancho de ala indicado en los artículos 6.3.2.1 y
                                                                6.3.2.2 a menos que la experiencia haya demostrado que
                                                                pueden variarse de forma segura y satisfactoria. Muchos
                                                                productos pretensados estándar que actualmente están en
                                                                uso no satisfacen los requisitos de ancho efectivo de ala de
                                                                los artículos 6.3.2.1 y 6.3.2.2, pero han demostrado un
                                                                comportamiento satisfactorio. Por esta razón, se deja al
                                                                juicio y experiencia del profesional habilitado la
                                                                determinación del ancho efectivo del ala. En el análisis
                                                                elástico y en las consideraciones de diseño no es
                                                                necesariamente conservador utilizar el ancho máximo de
                                                                ala permitido en el artículo 6.3.2.1.


<a id="c6.4"></a>
### 6.4 DISPOSICIÓN DE LA SOBRECARGA                               C 6.4. DISPOSICIÓN DE LA SOBRECARGA  <sub>p.131</sub>



<a id="c6.4.1"></a>
### 6.4.1 En el diseño para cargas gravitacionales de  <sub>p.131</sub>

entrepisos o cubiertas, se permite suponer que la
sobrecarga se aplica únicamente al nivel bajo
consideración.


<a id="c6.4.2"></a>
### 6.4.2 Para sistema de losas en una dirección y                 C 6.4.2. Deben establecerse los conjuntos más exigentes  <sub>p.131</sub>

vigas, se permite suponer (a) y (b):                            de fuerzas máximas de diseño, investigando los efectos de
                                                                la sobrecarga colocada en varias disposiciones críticas.


<!-- page 131 -->

                   REGLAMENTO                                                COMENTARIO

(a) El momento máximo positivo Mu cerca del
    centro de la luz, ocurre con L mayorada
    colocada en el vano y en vanos alternados.

(b) El momento máximo negativo Mu en un apoyo
    ocurre con L mayorada colocada en los vanos
    adyacentes solamente.


<a id="c6.4.3"></a>
### 6.4.3 Para sistema de losas en dos direcciones, los  <sub>p.132</sub>

momentos amplificados se deben calcular según los
artículos 6.4.3.1, 6.4.3.2 ó 6.4.3.3 y deben ser
equivalentes, al menos, a los momentos resultantes
de L mayorada aplicada simultáneamente en todos
los paneles.


<a id="c6.4.3.1"></a>
### 6.4.3.1 Cuando se conoce la disposición de L, el  <sub>p.132</sub>

sistema de losas debe analizarse para esa
distribución.


<a id="c6.4.3.2"></a>
### 6.4.3.2 Cuando L sea variable, sin exceder 0,75D, o  <sub>p.132</sub>

bien la naturaleza de L sea tal que todos los paneles
se carguen simultáneamente, se permite suponer
que se producen los Mu máximos en todas las
secciones con L mayorada actuando simultáneamen-
te en todos los paneles.


<a id="c6.4.3.3"></a>
### 6.4.3.3 Para condiciones de carga distintas a las      C 6.4.3.3. El uso de solo el 75 % de la sobrecarga  <sub>p.132</sub>

definidas en os artículos 6.4.3.1 ó 6.4.3.2, se puede   mayorada total para la disposición de carga que produce el
suponer (a) y (b):                                      momento máximo, se fundamenta en el hecho de que los
                                                        momentos máximos positivo y negativo debidos a la
(a) El momento máximo positivo Mu cerca del             sobrecarga no pueden ocurrir simultáneamente y que es
    centro de la luz del panel ocurre con un 75 % de    posible que ocurra una redistribución de los momentos
    L mayorada colocada sobre el panel y sobre          máximos antes que se presente la falla. Este procedimiento
    paneles alternos.                                   permite, en efecto, algunas sobretensiones locales bajo
                                                        sobrecarga mayorada total, si ésta se distribuye en la forma
(b) El momento máximo negativo Mu en un apoyo           prescrita; pero, aun así, asegura que la resistencia de
    se produce con un 75 % de L mayorada                cálculo del sistema de losa después de la redistribución de
    colocada solamente en paneles adyacentes.           momentos no es menor que la requerida para resistir las
                                                        cargas permanentes y sobrecargas mayoradas totales en
                                                        todos los paneles.


<a id="c6.5"></a>
### 6.5 MÉTODO DE ANÁLISIS SIMPLIFICADO PARA               C 6.5. MÉTODO DE ANÁLISIS SIMPLIFICADO  <sub>p.132</sub>

     VIGAS CONTINUAS Y LOSAS EN UNA                            PARA VIGAS CONTINUAS Y LOSAS EN
     DIRECCIÓN NO PRETENSADAS                                  UNA DIRECCIÓN NO PRETENSADAS


<a id="c6.5.1"></a>
### 6.5.1 Se permite calcular Mu y Vu para cargas  <sub>p.132</sub>

gravitacionales de acuerdo con este artículo para
vigas continuas y losas en una dirección que
cumplan con (a) hasta (e):

(a) Los elementos son prismáticos.

(b) Las cargas están uniformemente distribuidas.

(c) L ≤ 3D.

(d) Hay dos o más vanos.

(e) La luz del mayor de dos vanos adyacentes no
    excede en más del 20 % de la luz del menor.

Reglamento CIRSOC 201-25                                                                                Cap. 6 - 100


<!-- page 132 -->

                         REGLAMENTO                                                            COMENTARIO


<a id="c6.5.2"></a>
### 6.5.2 Mu debido a cargas gravitacionales debe                          C 6.5.2. Los momentos y cortes aproximados conducen a  <sub>p.133</sub>

calcularse de acuerdo con la Tabla 6.5.2.                               valores razonablemente conservadores para las condiciones
                                                                        indicadas cuando las vigas continuas y las losas en una
                                                                        dirección forman parte de un pórtico o de una construcción
                                                                        continua. Dado que la disposición de las cargas que
                                                                        produce valores críticos para los momentos en las
                                                                        columnas de pórticos difiere de aquella que produce
                                                                        momentos negativos máximos en las vigas, los momentos
                                                                        de columnas deberían evaluarse por separado.

Tabla 6.5.2. Momentos aproximados para vigas continuas y losas en una dirección no pretensadas

        Momento                Ubicación                                      Condición                                Mu

                                                     Extremo discontinuo monolítico con el apoyo                    wun2 / 14
                            Vanos extremos
         Positivo                                    El extremo discontinuo no está restringido                     wun2 / 11
                            Vanos interiores         Todos                                                          wun2 / 16

                                                     Elementos construidos monolíticamente con viga dintel
                                                                                                                    wun2 / 24
                          Cara interior de los       de apoyo
                          apoyos exteriores
                                                     Elementos construidos monolíticamente con columna de
                                                                                                                    wun2 / 16
                                                     apoyo
                        Cara exterior del primer     Dos vanos                                                      wun2 / 9
        Negativo(1)         apoyo interior           Más de dos vanos                                               wun2 / 10
                              Las demás
                                                     Todas                                                          wun2 / 11
                            caras de apoyos
                                                     (a)    Losas con luces que no excedan de 3 m
                           Cara de todos los
                                                     (b)    Vigas en las cuales la relación entre la suma de las
                        apoyos que cumplan (a)                                                                      wun2 / 12
                                                            rigideces de las columnas y la rigidez de la viga
                                 o (b)
                                                            exceda de 8 en cada extremo del vano
  (1)
        Para calcular los momentos negativos, n debe ser el promedio de las luces de los vanos adyacentes.


<a id="c6.5.3"></a>
### 6.5.3 Los momentos calculados según el artículo  <sub>p.133</sub>

6.5.2 no pueden ser redistribuidos.


<a id="c6.5.4"></a>
### 6.5.4 Vu debido a cargas gravitacionales se debe  <sub>p.133</sub>

calcular de acuerdo con la Tabla 6.5.4.

Tabla 6.5.4. Cortes aproximados para vigas
continuas y losas en una dirección no
pretensadas

                      Ubicación                            Vu
   Cara exterior del primer apoyo interior          1,15wun / 2
   Cara de todos los demás apoyos                     wun / 2

6.5.5. Los momentos a nivel de entrepiso o cubierta                     C 6.5.5. Este artículo se incluye para asegurarse que los
deben resistirse distribuyendo el momento entre las                     momentos se tengan en cuenta en el diseño de las
columnas inmediatamente debajo y por encima del                         columnas. El momento a que hace referencia corresponde a
entrepiso bajo estudio en proporción a las rigideces                    la diferencia en los momentos de los extremos de los
relativas de las columnas considerando sus                              elementos que aportican con la columna y que actúan en el
condiciones de restricción.                                             eje localizado en el centro de la columna.


<!-- page 133 -->

                   REGLAMENTO                                                 COMENTARIO


<a id="c6.6"></a>
### 6.6 ANÁLISIS LINEAL ELÁSTICO DE PRIMER                 C 6.6. ANÁLISIS LINEAL ELÁSTICO DE PRIMER  <sub>p.134</sub>

       ORDEN                                                     ORDEN


<a id="c6.6.1"></a>
### 6.6.1 Generalidades                                      C6.6.1. Generalidades  <sub>p.134</sub>



<a id="c6.6.1.1"></a>
### 6.6.1.1 Los efectos de la esbeltez deben                 C 6.6.1.1. Cuando se utiliza un análisis lineal elástico de  <sub>p.134</sub>

considerarse de acuerdo al artículo 6.6.4 a menos         primer orden, los efectos de esbeltez se calculan por medio
que el artículo 6.2.5.1 permita ignorarlos.               del procedimiento de amplificación de momentos
                                                          (MacGregor et al., 1970; MacGregor, 1993; Ford et al.,
                                                          1981).


<a id="c6.6.1.2"></a>
### 6.6.1.2 Se permite de acuerdo con el artículo 6.6.5 la  <sub>p.134</sub>

redistribución de los momentos calculados por medio
de un análisis elástico de primer orden.


<a id="c6.6.2"></a>
### 6.6.2 Modelos para        elementos     y   sistemas     C 6.6.2. Modelos para          elementos     y     sistemas  <sub>p.134</sub>

       estructurales                                               estructurales


<a id="c6.6.2.1"></a>
### 6.6.2.1 Los momentos en cualquier entrepiso o            C 6.6.2.1. Este artículo ha sido incluido para asegurarse  <sub>p.134</sub>

cubierta se deben determinar distribuyendo el             que los momentos se incluyan en el diseño de las columnas
momento entre las columnas inmediatamente por             si los elementos se han diseñado usando los artículos 6.5.1
encima y por debajo del entrepiso bajo                    y 6.5.2. El momento a que se hace referencia corresponde a
consideración, en proporción a las rigideces relativas    la diferencia entre los momentos de los extremos de los
de las columnas y según las condiciones de                elementos que aportican con la columna y que actúan en el
restricción a flexión.                                    eje localizado en el centro de la columna.


<a id="c6.6.2.2"></a>
### 6.6.2.2 En pórticos o construcción continua deben  <sub>p.134</sub>

tenerse en cuenta el efecto de la configuración y
disposición de carga en la transferencia de los
momentos a las columnas interiores y exteriores y a
las cargas excéntricas debida a otras causas.


<a id="c6.6.2.3"></a>
### 6.6.2.3 Se permite simplificar el modelo de análisis     C 6.6.2.3. Una característica común de los programas de  <sub>p.134</sub>

empleando (a) o (b) o ambos:                              computadora modernos para análisis estructural de pórticos
                                                          es la hipótesis de que los nudos son conexiones rígidas. El
(a) Se permite analizar las losas macizas o las           artículo 6.6.2.3(b) es para uso en elementos que se
    viguetas   en    una   dirección    construidas       intersectan en pórticos, como pueden ser los nudos viga-
    monolíticamente con sus apoyos, con luces             columna.
    libres no mayores de 3 m, como elementos
    continuos sobre apoyos simples, con luces
    iguales a las luces libres del elemento,
    despreciando el ancho de las vigas.

(b) En pórticos o construcción continua, se permite
    suponer que las regiones de intersección de los
    elementos son rígidas.


<a id="c6.6.3"></a>
### 6.6.3 Propiedades de las secciones                       C 6.6.3. Propiedades de las secciones  <sub>p.134</sub>



<a id="c6.6.3.1"></a>
### 6.6.3.1 Análisis para cargas mayoradas                   C 6.6.3.1. Análisis para cargas mayoradas  <sub>p.134</sub>


                                                          Para análisis ante cargas laterales, cualquiera de las
                                                          rigideces presentadas en los artículos 6.6.3.1.1 ó 6.6.3.1.2
                                                          pueden ser empleadas. Ambos requisitos utilizan valores
                                                          que se aproximan en edificaciones a la rigidez de sistemas
                                                          de hormigón armado cargados cerca, o más allá, del nivel
                                                          de fluencia y que han demostrado una correlación
                                                          razonable con resultados experimentales y analíticos
                                                          detallados (Moehle, 1992; Lepage, 1998). Para cargas
                                                          inducidas por sismo, se deben considerar las
                                                          especificaciones dadas en el INPRES-CIRSOC 103 -
                                                                              general, para las propiedades efectivas

Reglamento CIRSOC 201-25                                                                                   Cap. 6 - 102


<!-- page 134 -->

                      REGLAMENTO                                                      COMENTARIO

                                                                 de las secciones, Ec puede calcularse de acuerdo con el
                                                                 artículo 19.2.2, el módulo de corte puede tomarse como
                                                                 0,4Ec y las áreas pueden tomarse como se prescriben en la
                                                                 Tabla 6.6.3.1.1(a).


<a id="c6.6.3.1.1"></a>
### 6.6.3.1.1 Los momentos de inercia y el área de las             C 6.6.3.1.1. Los valores de I y A se han escogido  <sub>p.135</sub>

 secciones transversales de los elementos deben                  considerando resultados de ensayos de estructuras y de
 calcularse de acuerdo con las Tablas 6.6.3.1.1(a) ó             análisis, e incluyen una reserva por la variabilidad que
 6.6.3.1.1(b), a menos que se use un análisis más                pueden presentar las deformaciones calculadas. Los
 riguroso. Cuando existen cargas laterales de larga              momentos de inercia fueron tomados de MacGregor and
 duración, el momento de inercia, I, para las                    Hage (1977), los cuales incluyen un factor de reducción de
 columnas y tabiques debe dividirse por (1 + ds)                rigidez K = 0,875 (ver artículo C 6.6.4.5.2). Por ejemplo,
 donde ds es la relación entre el máximo corte                  el    momento      de    inercia   para     columnas     es
 mayorado de larga duración que actúa en un piso y               0,875 (0,80Ig) = 0,70Ig.
 el corte máximo mayorado de ese piso asociado con
 la misma combinación de carga.                                  El momento de inercia de vigas T se debería basar en el
                                                                 ancho efectivo del ala definido en los artículos 6.3.2.1 ó
                                                                 6.3.2.2. En general, es suficientemente preciso tomar Ig
 Tabla 6.6.3.1.1(a). Momentos de inercia y áreas                 para una viga T como 2Ig del alma, igual a 2(bw h3 / 12).
 de la sección transversal permitidos para el
 análisis elástico con cargas mayoradas                          Si los momentos y cortes amplificados, obtenidos a partir
                                                                 de un análisis considerando el momento de inercia de un
                                 Área de la      Área de la      tabique, tomado igual a 0,70Ig, indican con base en el
                                  sección         sección        módulo de ruptura, que el tabique se fisura en flexión, el
                     Momento    transversal     transversal
   Elemento y                                                    análisis debería repetirse con I = 0,35Ig en aquellos pisos
                        de          para            para
   condición                                                     en los cuales se ha anticipado fisuración bajo las cargas
                      inercia     deforma-        deforma-
                                   ciones       ciones por       mayoradas.
                                   axiales          corte
Columnas              0,70Ig                                     Los valores de los momentos de inercia fueron deducidos
         No                                                      para elementos no pretensados. Para elementos
Tabi- fisurados       0,70Ig
                                                                 pretensados, los momentos de inercia pueden diferir
ques                  0,35Ig        1,0Ag           bw h         dependiendo de la cantidad, ubicación y tipo de armadura,
         Fisurados
Vigas                 0,35Ig                                     y del grado de fisuración previo a alcanzar la carga última.
Placas planas y                                                  Los valores de rigidez para elementos de hormigón
                      0,25Ig
losas planas                                                     pretensado deberían incluir una tolerancia por la
                                                                 variabilidad de sus rigideces.

                                                                 Las ecuaciones de la Tabla 6.6.3.1.1(b) aportan valores
                                                                 más refinados de I, los cuales tienen en cuenta la carga
                                                                 axial, la excentricidad, la cuantía de armadura y la
                                                                 resistencia a la compresión del hormigón, tal como se
                                                                 presenta en: Khuntia and Ghosh (2004a, b). Las rigideces
                                                                 suministradas por estas referencias son aplicables a todos
                                                                 los niveles de carga, incluido servicio y última, y
                                                                 consideran un factor de reducción de rigidez K
                                                                 comparable al incluido en la Tabla 6.6.3.1.1(a). Para uso
                                                                 en los niveles de cargas distintos al último, Pu y Mu
                                                                 deberían remplazarse por los valores adecuados para el
                                                                 nivel de carga deseado.


<!-- page 135 -->

                       REGLAMENTO                                                               COMENTARIO

Tabla 6.6.3.1.1(b). Momentos de inercia alternati-
vos para análisis elástico con cargas mayoradas

               Valor alternativo de I para análisis elástico
Elemento
             Mínimo                         I                    Máximo
Columnas                              Ast      Mu        Pu
              0,35Ig      (0,8 + 25      ) (1-      - 0,5 ) Ig   0,875Ig
y tabiques                            Ag       Pu h      Po
  Vigas,
  placas                                          b
 planas y     0,25Ig        (0,1 + 25) (1,2 - 0,2 w) Ig          0,5Ig
                                                   d
   losas
  planas
Nota: Para elementos continuos sometidos a flexión, se permite que I
sea el promedio de los valores obtenidos para secciones críticas a
momento positivo y negativo. Pu y Mu deben calcularse de la
combinación de carga particular en consideración, o la combinación de
Pu y Mu que resulta en el menor valor de I.


<a id="c6.6.3.1.2"></a>
### 6.6.3.1.2 Para el análisis de cargas laterales                            C 6.6.3.1.2. El desplazamiento lateral de una estructura  <sub>p.136</sub>

mayoradas, se permite suponer I = 0,5Ig para todos                         bajo cargas laterales mayoradas puede ser sustancialmente
los elementos o calcular I mediante un análisis más                        diferente del calculado usando un análisis lineal debido, en
detallado que considere la rigidez efectiva de todos                       parte, a la respuesta inelástica de los elementos y a la
los elementos bajo las condiciones de carga.                               disminución de la rigidez efectiva. La selección de una
                                                                           rigidez efectiva adecuada para elementos estructurales de
                                                                           pórticos de hormigón armado tiene dos objetivos: 1)
                                                                           obtener estimativos realistas del desplazamiento lateral y
                                                                           2) determinar los efectos impuestos por el desplazamiento
                                                                           al sistema de resistencia de cargas gravitacionales de la
                                                                           estructura. Un análisis no lineal detallado de la estructura
                                                                           podría identificar adecuadamente estos dos efectos. Una
                                                                           forma simple de estimar un desplazamiento lateral no
                                                                           lineal equivalente usando un análisis lineal es reducir la
                                                                           rigidez de los elementos de hormigón de la estructura
                                                                           utilizada en el modelo lineal. El tipo de análisis para carga
                                                                           lateral afecta la selección de los valores apropiados de la
                                                                           rigidez efectiva. Para el análisis con carga de viento, donde
                                                                           es deseable prevenir la respuesta no lineal en la estructura,
                                                                           la rigidez efectiva representativa del comportamiento antes
                                                                           de que se presente fluencia puede ser adecuada. Para
                                                                           fuerzas inducidas por sismo, se deben considerar las
                                                                           especificaciones dadas en el INPRES-CIRSOC 103 -
                                                                           Parte II - 2026.

                                                                           El grado de confianza en los resultados de un análisis
                                                                           lineal simple depende del rigor computacional utilizado
                                                                           para definir la rigidez efectiva de cada elemento. Esta
                                                                           rigidez puede basarse en el valor secante de rigidez en el
                                                                           punto de fluencia del acero, o el valor secante en un punto
                                                                           antes de la fluencia del acero, si el análisis demuestra que
                                                                           no se espera fluencia para la condición de carga dada.


<a id="c6.6.3.1.3"></a>
### 6.6.3.1.3 Para el análisis de cargas laterales  <sub>p.136</sub>

mayoradas de sistemas de losas en dos direcciones
sin vigas, que se designan como parte de un sistema
sismorresistente, se debe realizar siguiendo los
lineamientos establecidos en INPRES-CIRSOC 103 -
Parte II - 2026.


<a id="c6.6.3.2"></a>
### 6.6.3.2 Análisis para cargas de servicio                                  C 6.6.3.2. Análisis para cargas de servicio  <sub>p.136</sub>



<a id="c6.6.3.2.1"></a>
### 6.6.3.2.1 Las flechas inmediatas y dependientes del  <sub>p.136</sub>


Reglamento CIRSOC 201-25                                                                                                    Cap. 6 - 104


<!-- page 136 -->

                    REGLAMENTO                                                        COMENTARIO

deben calcularse de acuerdo con el artículo 24.2.


<a id="c6.6.3.2.2"></a>
### 6.6.3.2.2 Se permite calcular los desplazamientos              C 6.6.3.2.2. Es necesarios realizar análisis de los  <sub>p.137</sub>

laterales inmediatos usando un momento de inercia               desplazamientos, vibraciones y periodos de la edificación a
igual a 1,4 veces I definido en el artículo 6.6.3.1 o           diversos niveles de cargas de servicio (no mayoradas)
bien usando un análisis más detallado, pero el valor            (Grossman 1987, 1990) para determinar el comportamiento
no debe exceder Ig.                                             de la estructura en servicio. Los momentos de inercia de
                                                                los elementos estructurales en el análisis para cargas de
                                                                servicio deberían ser representativos del grado de
                                                                fisuración en los diversos niveles de cargas de servicio
                                                                investigados. A menos que se disponga de un cálculo más
                                                                preciso de la fisuración en los diversos niveles de cargas de
                                                                servicio, se considera satisfactorio usar 1,0 / 0,7 = 1,4 veces
                                                                los momentos de inercia dados en el artículo 6.6.3.1, sin
                                                                exceder Ig, para los análisis de cargas de servicio. Las
                                                                consideraciones del comportamiento en servicio para
                                                                vibraciones se analizan en el artículo C 24.1.


<a id="c6.6.4"></a>
### 6.6.4 Efectos de la esbeltez,               método      de     C 6.6.4. Efectos de la esbeltez, método de amplificación  <sub>p.137</sub>

       amplificación de momentos                                         de momentos


<a id="c6.6.4.1"></a>
### 6.6.4.1 A menos que se cumpla con el artículo                  C 6.6.4.1. Este artículo describe un procedimiento  <sub>p.137</sub>

6.2.5.1, las columnas y pisos en una estructura                 aproximado de diseño el cual usa el concepto de
deben clasificarse como parte de estructuras con                amplificador de momento para tener en cuenta los efectos
desplazamiento lateral (no arriostradas) o sin                  de la esbeltez. Los momentos calculados por medio de un
desplazamiento lateral (arriostradas). El análisis de           análisis de primer orden son multiplicados por un
columnas en estructuras sin desplazamiento lateral              amplificador de momento, el cual es función de la fuerza
(arriostradas) debe basarse en el artículo 6.6.4.5. El          axial mayorada Pu y de la carga crítica de pandeo Pc de la
análisis de columnas en estructuras con                         columna. En el caso con desplazamiento, el amplificador
desplazamiento lateral (no arriostradas) debe                   de momento es función de la suma de Pu del piso y de la
basarse en el artículo 6.6.4.6.                                 suma de Pc de las columnas que resisten el desplazamiento
                                                                lateral del piso bajo consideración. Las estructuras con y
                                                                sin desplazamiento lateral son tratadas separadamente. Un
                                                                análisis de primer orden es un análisis elástico que no
                                                                incluye el efecto en las fuerzas internas causado por los
                                                                desplazamientos.

                                                                El método de diseño utilizando amplificación de momentos
                                                                requiere que el proyectista distinga entre estructuras sin
                                                                desplazamiento lateral (arriostradas), las cuales son
                                                                diseñadas de acuerdo con el artículo 6.6.4.5, y estructuras
                                                                con desplazamiento lateral (no arriostradas) que se diseñan
                                                                de acuerdo con el artículo 6.6.4.6. Frecuentemente, esto se
                                                                puede hacer comparando la rigidez lateral total de las
                                                                columnas en un piso con aquella de los elementos de
                                                                arriostramiento. Se puede suponer que un elemento a
                                                                compresión, como puede ser una columna, muro o riostra,
                                                                está arriostrado si está ubicado en un piso en el cual los
                                                                elementos de arriostramiento (tabiques estructurales,
                                                                celosías, u otros elementos de arriostramiento lateral)
                                                                tienen una rigidez lateral suficiente para resistir las
                                                                deformaciones laterales del piso, de tal manera que los
                                                                desplazamientos laterales resultantes no son lo
                                                                suficientemente grandes para afectar sustancialmente la
                                                                resistencia de la columna. Si no es inmediatamente
                                                                evidente sin hacer cálculos, el artículo 6.6.4.3 presenta dos
                                                                maneras para determinar si el desplazamiento lateral puede
                                                                despreciarse.


<a id="c6.6.4.2"></a>
### 6.6.4.2 Las dimensiones de la sección transversal de  <sub>p.137</sub>

cada elemento, utilizadas en el análisis, no deben


<!-- page 137 -->

                        REGLAMENTO                                              COMENTARIO

en los documentos de construcción; de lo contrario
se debe repetir el análisis. Cuando se usan las
rigideces de la Tabla 6.6.3.1.1(b) en el análisis, la
cuantía supuesta de armadura del elemento no
puede variar en más del 10 % de la armadura
especificada para el mismo elemento en los
documentos de construcción.


<a id="c6.6.4.3"></a>
### 6.6.4.3 Se permite analizar como arriostrados (sin        C 6.6.4.3. En el artículo 6.6.4.3(a), se indica que un piso  <sub>p.138</sub>

desplazamiento lateral) las columnas y pisos de la         dentro de una estructura se considera como arriostrado (sin
estructura, si se cumple (a) o (b):                        desplazamiento lateral) si el aumento en los momentos por
                                                           cargas laterales resultante del efecto P no excede 5 % de
(a) el incremento en los momentos extremos de la           los momentos de primer orden (MacGregor and Hage,
    columna debido a los efectos de segundo orden          1977). El artículo 6.6.4.3(b) presenta un método alternativo
    no excede de un 5 % de los momentos extremos           para determinar si el piso se considera arriostrado
    de primer orden.                                       basándose en el índice de estabilidad Q del piso. Al
                                                           calcular Q, Pu debería corresponder al caso de carga
(b) Q calculado de acuerdo con el artículo 6.6.4.4.1       lateral para el cual Pu es máximo. Debe notarse que una
    no excede 0,05.
                                                           estructura puede contener pisos arriostrados y no
                                                           arriostrados.

                                                           Si los desplazamientos por carga lateral de la estructura
                                                           han sido calculados usando cargas de servicio y los
                                                           momentos de inercia para carga de servicio dados en el
                                                           artículo 6.6.3.2.2, se permite calcular Q en la ecuación.
                                                           (6.6.4.4.1) usando 1,2 veces la suma de las cargas
                                                           gravitacionales de servicio, el corte del piso para cargas de
                                                           servicio, y 1,4 veces los desplazamientos de primer orden
                                                           del piso para carga de servicio.


<a id="c6.6.4.4"></a>
### 6.6.4.4 Propiedades de estabilidad                        C 6.6.4.4. Propiedades de estabilidad  <sub>p.138</sub>



<a id="c6.6.4.4.1"></a>
### 6.6.4.4.1 El índice de estabilidad para un piso, Q,  <sub>p.138</sub>

debe calcularse mediante:

           ∑ Pu  o
     Q=                                   (6.6.4.4.1)
            Vus c

donde Pu y Vus son la carga vertical total y el corte
horizontal mayorados del piso, respectivamente, en
el piso bajo consideración y o es el desplazamiento
lateral relativo (deriva) de primer orden entre la parte
superior e inferior del piso debido a Vus .


<a id="c6.6.4.4.2"></a>
### 6.6.4.4.2 La carga crítica de pandeo, Pc, debe            C 6.6.4.4.2. Al calcular la carga axial crítica para pandeo,  <sub>p.138</sub>

calcularse con:                                            la preocupación primordial es la selección de la rigidez
                                                           (EI)eff que aproxime razonablemente las variaciones de la
           π2 (EI)eff                                      rigidez debidas a fisuración, fluencia lenta y no linealidad
    Pc =                                 (6.6.4.4.2)       de la curva tensión-deformación unitaria. El artículo
            (k u )2
                                                           6.6.4.4.4 puede utilizarse para calcular.


<a id="c6.6.4.4.3"></a>
### 6.6.4.4.3 El factor de longitud efectiva, k, debe         C 6.6.4.4.3. El factor de longitud efectiva para un  <sub>p.138</sub>

determinarse usando un valor de Ec de acuerdo con          elemento a compresión, tal como una columna, muro o
el artículo 19.2.2 e I de acuerdo con el artículo          arriostramiento bajo comportamiento arriostrado varía

<a id="c6.6.3.1.1"></a>
### 6.6.3.1.1 Para elementos arriostrados (sin desplaza-      entre 0,5 y 1,0. Es recomendable usar un valor de k igual a  <sub>p.138</sub>

miento lateral), se permite considerar el factor de        1,0. Si se usan valores menores, el cálculo de k debería
longitud efectiva, k, como 1,0 y para elementos no         basarse en un análisis estructural usando los valores I
arriostrados, k debe ser al menos 1,0.                     dados en el artículo 6.6.3.1.1. Los ábacos de alineamiento
                                                           de Jackson y Moreland (Figura C 6.2.5.1) pueden usarse
                                                           para calcular los valores apropiados de k (ACI SP-17 (09);

Reglamento CIRSOC 201-25                                                                                    Cap. 6 - 106


<!-- page 138 -->

                        REGLAMENTO                                                   COMENTARIO

                                                                Column Research Council, 1966).


<a id="c6.6.4.4.4"></a>
### 6.6.4.4.4 Para columnas, (EI)eff debe calcularse de            C 6.6.4.4.4. El numerador de las ecuaciones (6.6.4.4.4a) a  <sub>p.139</sub>

acuerdo con (a), (b) o (c):                                     (6.6.4.4.4c) representa la rigidez de la columna a corto
                                                                plazo. La ecuación (6.6.4.4.4b) se dedujo para
                0,4 Ec Ig                                       excentricidades pequeñas y altos niveles de carga axial. La
(a) (EI)eff =                                 (6.6.4.4.4a)
                1 + dns                                        ecuación (6.6.4.4.4a) es una aproximación simplificada de
                                                                la ecuación (6.6.4.4.4b) y es menos precisa (Mirza 1990).
                (0,2 Ec Ig + Es Ise)                            Para mayor precisión, (EI)eff puede ser aproximado
(b) (EI)eff =                                 (6.6.4.4.4b)
                       1 + dns                                 usando la ecuación (6.6.4.4.4c).
                  Ec I
(c) (EI)eff =                                 (6.6.4.4.4c)      La fluencia lenta debida a cargas de larga duración
                1 + dns
                                                                incrementa la deformación lateral de una columna y por lo
                                                                tanto la amplificación del momento. Esto se aproxima en
donde el término dns es la relación entre la máxima            diseño reduciendo la rigidez, (EI)eff, usada para calcular
carga axial de larga duración mayorada dentro de un
                                                                Pc y por lo tanto , dividiendo el término EI a corto plazo
piso y la máxima carga axial mayorada asociada con
la misma combinación de carga, e I en la ecuación               del numerador de las ecuaciones (6.6.4.4.4a) hasta
(6.6.4.4.4.c) debe calcularse de acuerdo con la Tabla           (6.6.4.4.4c) por (1 + dns). Para simplificar, se puede
6.6.3.1.1(b) para columnas y tabiques.                          suponer que dns = 0,6. En este caso, la ecuación
                                                                (6.6.4.4.4a) se vuelve (EI)eff = 0,25Ec Ig.

                                                                En columnas de hormigón armado sometidas a cargas de
                                                                larga duración, la fluencia lenta transfiere parte de la carga
                                                                del hormigón a la armadura longitudinal, aumentando las
                                                                tensiones en el acero. En el caso de columnas con poca
                                                                armadura esta transferencia de carga puede hacer que la
                                                                armadura en compresión fluya prematuramente, resultando
                                                                en una disminución del EI efectivo. En consecuencia, los
                                                                términos para la armadura longitudinal y para el hormigón
                                                                en la ecuación (6.6.4.4.4b) deben ser reducidos para tener
                                                                en cuenta la fluencia lenta.


<a id="c6.6.4.5"></a>
### 6.6.4.5 Método de amplificación de momentos:                   C 6.6.4.5. Método de amplificación de momentos:  <sub>p.139</sub>

         Estructuras sin desplazamiento lateral                            Estructuras sin desplazamiento lateral


<a id="c6.6.4.5.1"></a>
### 6.6.4.5.1 El momento amplificado utilizado en el  <sub>p.139</sub>

diseño de columnas y tabiques, Mc, debe ser el
momento amplificado de primer orden M2 amplificado
por los efectos de curvatura del elemento, de
acuerdo con la ecuación (6.6.4.5.1):

        Mc =  M2                             (6.6.4.5.1)


<a id="c6.6.4.5.2"></a>
### 6.6.4.5.2 El factor de amplificación  debe calcularse         C 6.6.4.5.2. El factor 0,75 en la ecuación (6.6.4.5.2) es un  <sub>p.139</sub>

con:                                                            factor de reducción de rigidez K, que está basado en la
                                                                probabilidad de tener resistencia baja en una sola columna
                  Cm                                            esbelta aislada. Los estudios descritos en Mirza et al.
        =          Pu     ≥ 1,0            (6.6.4.5.2)
             1-                                                 (1987), indican que el factor de reducción de rigidez K no
                  0,75Pc
                                                                tiene los mismos valores que el factor de reducción de
                                                                resistencia  aplicable a la sección de la columna. Estos
                                                                estudios sugieren que el valor del factor de reducción de
                                                                rigidez K para una columna aislada debería ser 0,75, tanto
                                                                para columnas con estribos como con zunchos en espiral.
                                                                En el caso de una estructura de varios pisos, los
                                                                desplazamientos de la columna y de la estructura dependen
                                                                de la resistencia promedio del hormigón que es mayor a la
                                                                resistencia del hormigón de la columna crítica única de
                                                                baja resistencia. Por esta razón, el valor K implícito en los
                                                                valores I en el artículo 6.6.3.1.1 es de 0,875.


<!-- page 139 -->

                   REGLAMENTO                                                  COMENTARIO


<a id="c6.6.4.5.3"></a>
### 6.6.4.5.3 Cm debe calcularse de acuerdo con (a) o        C 6.6.4.5.3. El factor Cm es un factor de corrección que  <sub>p.140</sub>

(b):                                                      relaciona el diagrama de momentos real con un diagrama
                                                          de momentos uniforme equivalente. La deducción del
(a) Para columnas sin cargas             transversales    amplificador de momento supone que el momento máximo
    aplicadas entre los apoyos                            está en o cerca de la mitad de la altura de la columna. Si el
                                                          momento máximo se produce en uno de los extremos de la
                  M                                       columna, el diseño debería basarse en un momento
    Cm = 0,6 - 0,4 1                      (6.6.4.5.3a)
                 M2                                       uniforme equivalente CmM2 el cual produce el mismo
                                                          momento máximo al ser amplificado (MacGregor et al.,
    donde el término M1 / M2 es negativo si la            1970).
    columna presenta curvatura simple y positivo si
    presenta doble curvatura.                             La convención de signos para M1 / M2 ha sido actualizada
                                                          para seguir la convención de la regla de mano derecha. Por
(b) Para columnas con cargas             transversales    lo tanto, M1 / M2 es negativa si el elemento está deformado
    aplicadas entre los apoyos
                                                          en curvatura simple y positiva si lo está en doble curvatura.
                                                          Lo anterior corresponde a un cambio respecto a la
    Cm = 1,0                              (6.6.4.5.3b)
                                                          convención de signos del Reglamento CIRSOC 201-05.

                                                          En el caso de columnas sometidas a cargas transversales
                                                          entre los apoyos, es posible que el momento máximo se
                                                          produzca en una sección lejos del extremo del elemento. Si
                                                          esto ocurre, el valor del máximo momento calculado en
                                                          cualquier sección del elemento debería ser usado como
                                                          valor de M2 en la ecuación (6.6.4.5.1). Cm debe ser
                                                          tomado igual a 1,0 para este caso.


<a id="c6.6.4.5.4"></a>
### 6.6.4.5.4 M2 en la ecuación. (6.6.4.5.1) debe ser al     C 6.6.4.5.4. En este Reglamento, la esbeltez se tiene en  <sub>p.140</sub>

menos M2,min calculado de acuerdo con la ecuación         cuenta amplificando los momentos extremos de la
(6.6.4.5.4) en cada eje separadamente.                    columna. Si los momentos amplificados de la columna son
                                                          muy pequeños o nulos, el diseño de columnas esbeltas
       M2,min = Pu (15 + 0,03h)           (6.6.4.5.4)     debería basarse en la excentricidad mínima dada en la
                                                          ecuación (6.6.4.5.4). No se pretende que la excentricidad
                                                          mínima se aplique a los dos ejes simultáneamente.
Cuando M2,min exceda M2, el valor de Cm debe ser
igual a 1,0 ó determinarse considerando la relación       Cuando el diseño se base en la excentricidad mínima, los
de los momentos calculados en los extremos M1 / M2        momentos extremos amplificados de la columna, obtenidos
usando la ecuación (6.6.4.5.3a).                          del análisis estructural, son usados en la ecuación
                                                          (6.6.4.5.3a) para determinar la relación M1 / M2. Esto
                                                          elimina lo que de otra manera sería una discontinuidad
                                                          entre columnas con excentricidades calculadas menores
                                                          que la excentricidad mínima y columnas con
                                                          excentricidades calculadas mayores o iguales a la
                                                          excentricidad mínima.


<a id="c6.6.4.6"></a>
### 6.6.4.6 Método de amplificación de momentos:             C 6.6.4.6. Método de amplificación de momentos:  <sub>p.140</sub>

         estructuras con desplazamiento lateral                      estructuras con desplazamiento lateral


<a id="c6.6.4.6.1"></a>
### 6.6.4.6.1 Los momentos M1 y M2 en los extremos de        C 6.6.4.6.1. El análisis descrito en este artículo se refiere  <sub>p.140</sub>

una columna individual deben calcularse con (a) y         sólo a estructuras planas sometidas a cargas que causan
(b):                                                      desplazamientos en su propio plano. Si los
                                                          desplazamientos causados por las cargas laterales incluyen
(a) M1 = M1ns + s M1s                    (6.6.4.6.1a)    desplazamientos torsionales significativos, la amplificación
                                                          de momentos de las columnas más alejadas del centro de
                                                          giro puede subestimarse al usar este procedimiento. En
(b) M2 = M2ns + s M2s                    (6.6.4.6.1b)
                                                          estos casos debería emplearse un procedimiento de análisis
                                                          tridimensional de segundo orden.


<a id="c6.6.4.6.2"></a>
### 6.6.4.6.2 El amplificador de momento s debe ser         C 6.6.4.6.2. Se permiten tres métodos para calcular el  <sub>p.140</sub>

calculado con (a), (b) o (c). Si el s calculado excede   amplificador de momento. Estos enfoques incluyen el
                                                          método Q, el concepto de la suma de P y el análisis
1,5, solo se permite (b) o (c).
                                                          elástico de segundo orden:

Reglamento CIRSOC 201-25                                                                                   Cap. 6 - 108


<!-- page 140 -->

                         REGLAMENTO                                                 COMENTARIO

            1
(a) s =         ≥ 1,0                        (6.6.4.6.2a)      (a) Método Q:
           1-Q

                1                                                  El análisis iterativo P para obtener los momentos de
(b) s =        Pu ≥ 1,0                     (6.6.4.6.2b)         segundo orden puede ser representado por una serie
           1-
              0,75 Pc                                             infinita. La solución de esta serie está dada por la
                                                                   ecuación (6.6.4.6.2a) (MacGregor and Hage, 1977).
(c) Análisis elástico de segundo orden                             Lai and MacGregor (1983) muestra que la ecuación
                                                                   (6.6.4.6.2a) predice apropiadamente los momentos de
donde Pu es la sumatoria para todas las cargas                    segundo orden en estructuras no arriostradas mientras
verticales mayoradas en un piso y Pc es la                        el valor de s no exceda 1,5.
sumatoria de todas las columnas que resisten el
desplazamiento lateral en un piso. Pc se calcula                   Los diagramas de momento P para columnas
usando la ecuación (6.6.4.4.2) con el valor de k                   flexadas (deformadas) son curvos, con  relacionado
determinado para elementos con desplazamiento                      con la línea elástica deformada de la columna. La
lateral, en artículo 6.6.4.4.3 y (EI)eff del artículo              ecuación (6.6.4.6.2a) y la mayoría de los programas de
                                                                   computador disponibles comercialmente para análisis
6.6.4.4.4 donde  ds debe substituir a  dns.
                                                                   de segundo orden han sido desarrollados suponiendo
                                                                   que los momentos P resultan de fuerzas iguales y
                                                                   opuestas P / c aplicadas en la parte inferior y
                                                                   superior del piso. Estas fuerzas producen un diagrama
                                                                   de momentos P en línea recta. Los diagramas curvos
                                                                   de momento P producen desplazamientos laterales
                                                                   del orden de 15 % mayores que aquellos obtenidos de
                                                                   diagramas rectos de momento P. Este efecto se puede
                                                                   incluir en la ecuación (6.6.4.6.2a) escribiendo el
                                                                   denominador como (1–1,15Q) en vez de (1–Q). El
                                                                   factor 1,15 se ha dejado fuera de la ecuación
                                                                   (6.6.4.6.2a) para mayor simplicidad.

                                                                   Si los desplazamientos han sido calculados usando
                                                                   cargas de servicio, Q en la ecuación (6.6.4.6.2a)
                                                                   debería ser calculado de la manera presentada en
                                                                   artículo C 6.6.4.3.

                                                                   El análisis de factor Q está basado en desplazamientos
                                                                   calculados usando los valores de I del artículo
                                                                   6.6.3.1.1, los cuales incluyen un factor de reducción de
                                                                   la rigidez equivalente K. Estos valores de I llevan a
                                                                   una sobre estimación del orden de 20 a 25 % de las
                                                                   deformaciones laterales que corresponden a un factor
                                                                   K de reducción de rigidez entre 0,80 y 0,85 en los
                                                                   momentos P. Como resultado, no se requiere ningún
                                                                   factor  adicional. Una vez se han establecido los
                                                                   momentos usando la ecuación (6.6.4.6.2a), el diseño
                                                                   de las secciones transversales de las columnas
                                                                   involucra los factores de reducción de la resistencia 
                                                                   del artículo 21.2.2.

                                                                (b) Concepto de la suma de P

                                                                   Para verificar los efectos de la estabilidad del piso, δs
                                                                   se calcula como un valor promedio para el piso
                                                                   completo con base en el uso de Pu / Pc. Esto refleja
                                                                   la interacción en los efectos P de todas las columnas
                                                                   que resisten el desplazamiento lateral del piso, dado
                                                                   que la deformación lateral de todas las columnas en el
                                                                   piso debería ser igual en ausencia de desplazamientos
                                                                   torsionales alrededor del eje vertical. Además, es
                                                                   posible que una columna individual particularmente
                                                                            en una estructura no arriostrada pueda tener


<!-- page 141 -->

                   REGLAMENTO                                                 COMENTARIO

                                                             desplazamientos sustanciales a media altura aún si está
                                                             adecuadamente arriostrada contra desplazamientos
                                                             laterales en los extremos por otras columnas en el piso.
                                                             Dicha columna debe ser verificada usando el artículo
                                                             6.6.4.6.4.

                                                             El término 0,75 en el denominador de la ecuación
                                                             (6.6.4.6.2b) es un factor de reducción de la rigidez K,
                                                             tal como se indica en el artículo C 6.6.4.5.2.

                                                             En el cálculo de (EI)eff, ds será normalmente cero
                                                             para una estructura no arriostrada, debido a que las
                                                             cargas laterales son generalmente de corta duración.
                                                             Las deformaciones por desplazamiento lateral, debidas
                                                             a cargas de corto plazo como viento o sismo, son una
                                                             función de la rigidez de corto plazo de las columnas
                                                             después de un período de carga gravitatoria sostenida.

                                                             Para este caso, la definición de ds en el artículo
                                                             6.6.3.1.1 da un valor ds = 0. En el caso inusual de una
                                                             estructura con desplazamiento lateral donde las cargas
                                                             laterales son sostenidas, ds no será igual a cero. Esto
                                                             podría ocurrir si una construcción en un terreno
                                                             inclinado es sometida a presiones de tierra en un lado,
                                                             pero no en el otro.


<a id="c6.6.4.6.3"></a>
### 6.6.4.6.3 Los elementos a flexión deben diseñarse       C 6.6.4.6.3. La resistencia de una estructura con  <sub>p.142</sub>

para los momentos totales amplificados de los            desplazamiento lateral está regida por la estabilidad de las
extremos de las columnas en el nudo.                     columnas y por el grado de restricción en sus extremos
                                                         aportado por las vigas de la estructura. Si se forma una
                                                         articulación plástica en la viga de restricción, la estructura
                                                         se aproxima a un mecanismo de falla y su capacidad de
                                                         carga axial se ve drásticamente reducida. Este artículo
                                                         presenta los medios para que el proyectista verifique que
                                                         los elementos de restricción a flexión tengan la capacidad
                                                         de resistir los momentos amplificados de la columna en el
                                                         nudo.


<a id="c6.6.4.6.4"></a>
### 6.6.4.6.4 Los efectos de segundo orden se deben         C 6.6.4.6.4. En un elemento a compresión, tales como  <sub>p.142</sub>

considerar en toda la longitud de la columna en los      una columna, muro o arriostramiento, el momento máximo
pórticos no arriostrados. Se permite calcular estos      puede ocurrir lejos de sus extremos. A pesar de que los
efectos usando el artículo 6.6.4.5, donde Cm se          programas de computadora para análisis de segundo orden
calcula utilizando M1 y M2 del artículo 6.6.4.6.1.       pueden ser utilizados para evaluar la amplificación de los
                                                         momentos en los extremos, la amplificación en la parte
                                                         central puede no ser tenida en cuenta a menos que el
                                                         elemento se subdivida a lo largo de su longitud. La
                                                         amplificación puede ser evaluada usando el procedimiento
                                                         descrito en el artículo 6.6.4.5.


<a id="c6.6.5"></a>
### 6.6.5 Redistribución de momentos en elementos           C 6.6.5. Redistribución de momentos en elementos  <sub>p.142</sub>

       continuos a flexión                                        continuos a flexión


<a id="c6.6.5.1"></a>
### 6.6.5.1 Excepto cuando se empleen valores               La redistribución de momentos depende de una adecuada  <sub>p.142</sub>

aproximados de los momentos, de acuerdo con el           ductilidad en las zonas de articulación plástica. Estas zonas
artículo 6.5, cuando los momentos se han calculado       de articulación plástica se desarrollan en secciones de
utilizando el artículo 6.8 o bien cuando los momentos    momento máximo positivo o negativo y causan un cambio
en losas en dos direcciones se han calculado             en el diagrama de momentos elásticos. El resultado
utilizando la disposición de cargas especificada en el   habitual es una reducción en los valores de los momentos
artículo 6.4.3.3, siempre y cuando se cumplan (a) y      máximos negativos en las zonas de los apoyos y un
(b) se permite disminuir los momentos calculados por     incremento en los valores de los momentos positivos entre
medio de la teoría elástica en las secciones de          apoyos con respecto a los calculados por medio del análisis

Reglamento CIRSOC 201-25                                                                                   Cap. 6 - 110


<!-- page 142 -->

                    REGLAMENTO                                                      COMENTARIO

máximo momento negativo o máximo momento                        elástico. Sin embargo, como los momentos negativos se
positivo para cualquier distribución de carga:                  determinan usualmente para una distribución de carga y los
                                                                momentos positivos para otra (ver artículo 6.4.3 para una
(a) Los elementos a flexión son continuos.                      excepción bajo ciertas condiciones carga), en ocasiones,
                                                                puede obtenerse economía en las armaduras mediante la
(b) t ≥ 0,0075 en la sección donde se reduce el                reducción de los momentos máximos elásticos positivos y
    momento.                                                    el incremento de los momentos negativos, angostando así
                                                                la envolvente de momentos máximos negativos y positivos

<a id="c6.6.5.2"></a>
### 6.6.5.2 En elementos pretensados, los momentos                 en cualquier sección del tramo (Bondy, 2003). Las  <sub>p.143</sub>

incluyen aquellos debidos a las cargas mayoradas y              articulaciones plásticas permiten la utilización de la
los debidos a las reacciones inducidas por el                   capacidad total de más secciones de un elemento a flexión
pretensado.                                                     al nivel de carga última.


<a id="c6.6.5.3"></a>
### 6.6.5.3 En la sección donde el momento se reduce,              La redistribución de momentos permitida por el  <sub>p.143</sub>

la redistribución no debe exceder al menor entre                Reglamento se muestra en la Figura C 6.6.5. Utilizando
                                                                valores conservadores para el límite de las deformaciones
1000t % y 20 %.
                                                                unitarias en el hormigón y longitudes de articulación
                                                                plástica obtenidas de numerosos ensayos, se analizaron

<a id="c6.6.5.4"></a>
### 6.6.5.4 El momento reducido debe usarse para                   elementos sometidos a flexión con pequeña capacidad de  <sub>p.143</sub>

calcular los momentos redistribuidos en todas las               rotación, para estudiar la redistribución de momentos,
otras secciones dentro del vano. El equilibrio estático         hasta un 20 %, dependiendo de la cuantía de la armadura.
se debe mantener después de la redistribución de los            Como se muestra allí, los porcentajes de redistribución de
momentos para cada disposición de las cargas.                   momentos permitidos son conservadores con respecto a los
                                                                porcentajes calculados tanto para fy = 420 MPa como

<a id="c6.6.5.5"></a>
### 6.6.5.5 Los cortes y las reacciones en los apoyos              550 MPa. Los estudios realizados por Cohn (1965) y  <sub>p.143</sub>

deben calcularse según el equilibrio estático                   Mattock (1959) respaldan esta conclusión e indican que la
considerando los momentos redistribuidos para cada              fisuración y la flecha de vigas diseñadas utilizando
disposición de carga.                                           redistribución de momentos no son mucho mayores, bajo
                                                                cargas de servicio, que las de vigas diseñadas utilizando
                                                                momentos provenientes directamente de la teoría elástica.
                                                                Además, estos estudios indican que queda disponible una
                                                                adecuada capacidad de rotación para la redistribución de
                                                                momentos permitida por el Reglamento si los elementos
                                                                satisfacen los requisitos del artículo 6.6.5.1.

                                                                Los requisitos para la redistribución de momentos se apli-
                                                                can igualmente a los elementos pretensados (Mast, 1992).

                                                                Las deformaciones elásticas causadas por un cordón no
                                                                concordante cambian la cantidad de rotación inelástica
                                                                requerida para obtener una cantidad dada de redistribución
                                                                de momentos. Por lo contrario, para una viga con una
                                                                capacidad rotacional inelástica dada, la cantidad en que
                                                                puede variar el momento en el apoyo cambia por una
                                                                cantidad igual al momento secundario en el apoyo debido
                                                                al pretensado. En consecuencia, el Reglamento requiere
                                                                que los momentos secundarios causados por las reacciones
                                                                generadas por las fuerzas de pretensado sean incluidos al
                                                                determinar los momentos de diseño.

                                                                La redistribución de momentos, permitida en el artículo
                                                                6.6.5, no debe usarse donde se utilicen momentos flexores
                                                                aproximados como los obtenidos por medio del método
                                                                simplificado del artículo 6.5.

                                                                La redistribución de momentos tampoco es apropiada en
                                                                sistemas de losa en dos direcciones que se analicen usando
                                                                los requisitos de carga dados en el artículo 6.4.3.3. Estas
                                                                cargas utilizan solo el 75 % de la sobrecarga total
                                                                mayorada, lo cual está basado en consideraciones de
                                                                redistribución de momentos.


<!-- page 143 -->

                   REGLAMENTO                                                 COMENTARIO

                                                         Figura C 6.6.5. Redistribución permitida de momentos
                                                                         según la capacidad mínima de rotación.


<a id="c6.7"></a>
### 6.7 ANÁLISIS LINEAL ELÁSTICO DE SEGUNDO               C 6.7. ANÁLISIS  LINEAL                ELÁSTICO          DE  <sub>p.144</sub>

       ORDEN                                                    SEGUNDO ORDEN


<a id="c6.7.1"></a>
### 6.7.1 Generalidades                                     C 6.7.1. Generalidades  <sub>p.144</sub>


                                                         Los análisis lineales elásticos de segundo orden consideran
                                                         la geometría deformada de la estructura en las ecuaciones
                                                         de equilibrio para determinar los efectos P. Se supone
                                                         que la estructura se mantiene elástica, pero se consideran
                                                         los efectos de la fisuración y fluencia lenta usando una
                                                         rigidez efectiva EI. Por lo contrario, el análisis lineal
                                                         elástico de primer orden satisface las ecuaciones de
                                                         equilibrio usando la geometría original no deformada de la
                                                         estructura y calcula los efectos P amplificando los
                                                         momentos en los extremos de la columna causados por el
                                                         desplazamiento lateral usando la ecuación (6.6.4.6.2a) o la
                                                         ecuación (6.6.4.6.2b).


<a id="c6.7.1.1"></a>
### 6.7.1.1 Un análisis lineal elástico de segundo orden    C 6.7.1.1. Las rigideces EI usadas en un análisis elástico  <sub>p.144</sub>

debe tener en cuenta la influencia de las cargas         para el cálculo por resistencia deberían representar las
axiales, la presencia de regiones fisuradas a lo largo   rigideces de los elementos inmediatamente antes de la
del elemento y los efectos de duración de las cargas.    falla. Esto es particularmente cierto para un análisis de
Estas consideraciones se satisfacen usando las           segundo orden, el cual debería predecir los
propiedades de la sección transversal definidas en el    desplazamientos laterales para cargas que se están
artículo 6.7.2.                                          acercando a la carga última. Los valores de EI no deberían
                                                         estar basados únicamente en la relación momento-
                                                         curvatura para la sección más cargada a lo largo del
                                                         elemento. Por el contrario, deberían corresponder a la
                                                         relación momento rotación en el extremo para el elemento
                                                         completo.

                                                         Para tener en cuenta la variabilidad de las propiedades
                                                         reales del elemento en el análisis, las propiedades del
                                                         elemento usadas en el análisis deberían multiplicarse por
                                                         un factor de reducción de rigidez K menor que la unidad.
                                                         Las propiedades de la sección definidas en el artículo 6.7.2
                                                         ya incluyen este factor de reducción de rigidez. El factor de

Reglamento CIRSOC 201-25                                                                                  Cap. 6 - 112


<!-- page 144 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                reducción de rigidez, K, puede tomarse como 0,875. Debe
                                                                hacerse notar que la rigidez global se reduce aún más
                                                                debido a que el módulo de elasticidad, Ec, está basado en
                                                                la resistencia especificada a compresión del hormigón,
                                                                mientras que los desplazamientos laterales son función de
                                                                la resistencia promedio a la compresión del hormigón, la
                                                                cual, por lo general, es más alta.


<a id="c6.7.1.2"></a>
### 6.7.1.2 Se deben considerar los efectos de esbeltez            C 6.7.1.2. En un elemento a compresión, el momento  <sub>p.145</sub>

a lo largo de la longitud de la columna. Se permite             máximo puede ocurrir alejado de sus extremos. En los
calcular estos efectos usando el artículo 6.6.4.5.              programas de computadora de análisis de segundo orden,
                                                                las columnas se pueden subdividir usando nodos a lo largo
                                                                de su longitud con el fin de evaluar los efectos de esbeltez
                                                                en la zona entre los extremos. Cuando la columna no se
                                                                subdivide a lo largo de su longitud, los efectos de esbeltez
                                                                pueden evaluarse utilizando el amplificador de momentos
                                                                para el caso sin desplazamiento lateral especificado en el
                                                                artículo 6.6.4.5 utilizando los momentos en los extremos
                                                                del elemento provenientes de un análisis de segundo orden
                                                                como datos de entrada. El análisis de segundo orden
                                                                considera dentro del procedimiento el desplazamiento
                                                                relativo de los extremos del elemento.


<a id="c6.7.1.3"></a>
### 6.7.1.3 Las dimensiones de la sección transversal de  <sub>p.145</sub>

cada elemento, utilizadas en el análisis para calcular
los efectos de esbeltez, no deben diferir en más del
10 % de las dimensiones indicadas en los documen-
tos de construcción; de lo contrario se debe repetir el
análisis.


<a id="c6.7.1.4"></a>
### 6.7.1.4 Se permite la redistribución de los momentos  <sub>p.145</sub>

calculados por medio del análisis elástico de
segundo orden de acuerdo con el artículo 6.6.5.


<a id="c6.7.2"></a>
### 6.7.2 Propiedades de la sección                                C 6.7.2. Propiedades de la sección  <sub>p.145</sub>



<a id="c6.7.2.1"></a>
### 6.7.2.1 Análisis para carga mayorada  <sub>p.145</sub>


Se permite usar las propiedades de la sección
calculadas según el artículo 6.6.3.1.


<a id="c6.7.2.2"></a>
### 6.7.2.2 Análisis para cargas de servicio                       C 6.7.2.2. Análisis para cargas de servicio  <sub>p.145</sub>



<a id="c6.7.2.2.1"></a>
### 6.7.2.2.1 Las flechas inmediatas y dependientes del  <sub>p.145</sub>

tiempo, provenientes de las cargas gravitacionales
deben calcularse de acuerdo con el artículo 24.2.


<a id="c6.7.2.2.2"></a>
### 6.7.2.2.2 De manera alternativa, se permite calcular           C 6.7.2.2.2. Ver artículo C 6.6.3.2.2.  <sub>p.145</sub>

los desplazamientos inmediatos usando un momento
de inercia de 1,4 veces I definido en el artículo
6.6.3.1 o bien usando un análisis más detallado, pero
el valor no debe exceder Iu.


<a id="c6.8"></a>
### 6.8 ANÁLISIS INELÁSTICO                                        C 6.8. ANÁLISIS INELÁSTICO  <sub>p.145</sub>



<a id="c6.8.1"></a>
### 6.8.1 Generalidades                                            C 6.8.1. Generalidades  <sub>p.145</sub>



<a id="c6.8.1.1"></a>
### 6.8.1.1 El análisis inelástico debe considerar la no           C 6.8.1.1. La no linealidad de los materiales puede ser  <sub>p.145</sub>

linealidad del material. Un análisis inelástico de              afectada por múltiples factores incluyendo la duración de
primer orden debe cumplir equilibrio en la                      las cargas, contracción y fluencia lenta.


<!-- page 145 -->

                   REGLAMENTO                                                  COMENTARIO

configuración no deformada. Un análisis inelástico de
segundo orden debe cumplir equilibrio en la
configuración deformada.


<a id="c6.8.1.2"></a>
### 6.8.1.2 El procedimiento de análisis inelástico debe     C 6.8.1.2. Una concordancia sustancial debería ser  <sub>p.146</sub>

demostrar que lleva al cálculo de la resistencia y las    demostrada en puntos característicos de la respuesta
deformaciones que esté sustancialmente de acuerdo         reportada. Los puntos característicos que se seleccionen
con los resultados de los ensayos físicos de              dependen del propósito del análisis, las cargas aplicadas, y
componentes, ensamblajes, o sistemas estructurales        la respuesta exhibida por el ensamblaje de componentes o
de hormigón armado que muestren mecanismos de             el sistema estructural. Para análisis no lineales que sirvan
respuesta congruentes con los que se esperan en la        de soporte al diseño bajo cargas de servicio, los puntos
estructura que se está diseñando.                         característicos representarán cargas y deformaciones
                                                          menores a aquellas que correspondan a fluencia del acero.
                                                          Para análisis no lineales que sirvan de soporte para diseño
                                                          o evaluación de la respuesta bajo cargas al nivel de diseño,
                                                          los puntos característicos representarán cargas y
                                                          deformaciones menores que las que correspondan a
                                                          fluencia del acero y también puntos que correspondan a
                                                          fluencia del acero y al inicio de la pérdida de resistencia.
                                                          No hay necesidad de representar la pérdida de resistencia si
                                                          las cargas de proyecto no extienden la respuesta dentro del
                                                          intervalo de pérdida de resistencia. Típicamente, los
                                                          análisis inelásticos de apoyo al diseño deberían emplear las
                                                          resistencias especificadas de los materiales y valores
                                                          medios de otras propiedades de los materiales y rigideces
                                                          de los componentes. El análisis no lineal, para verificar el
                                                          diseño de estructuras de hormigón sismorresistentes, debe
                                                          ser de acuerdo con lo especificado en INPRES-CIRSOC
                                                          103 - Parte II - 2026.


<a id="c6.8.1.3"></a>
### 6.8.1.3 A menos que de acuerdo con el artículo 6.2.5     C 6.8.1.3. Ver artículo C 6.7.1.2.  <sub>p.146</sub>

se permita despreciar los efectos de esbeltez, un
análisis inelástico debe cumplir equilibrio en la
configuración deformada. Se permite calcular los
efectos de la esbeltez a lo largo de la longitud de la
columna usando el artículo 6.6.4.5.


<a id="c6.8.1.4"></a>
### 6.8.1.4 Las dimensiones de la sección transversal de  <sub>p.146</sub>

cada elemento, utilizadas en el análisis para calcular
los efectos de esbeltez, no deben diferir en más del
10 % de las dimensiones indicadas en los documen-
tos de construcción; de lo contrario se debe repetir el
análisis.


<a id="c6.8.1.5"></a>
### 6.8.1.5 No se permite la redistribución de los           C 6.8.1.5. El artículo 6.6.5 permite la redistribución de  <sub>p.146</sub>

momentos calculados por medio de un análisis              momentos calculados utilizando análisis elástico para tener
inelástico.                                               en cuenta la respuesta inelástica del sistema. Los
                                                          momentos calculados por medio de análisis inelástico
                                                          tienen en cuenta de forma explícita la respuesta inelástica,
                                                          y por lo tanto no es apropiado realizar una redistribución
                                                          de momentos adicional.


<a id="c6.9"></a>
### 6.9 ACEPTACIÓN DE ANÁLISIS UTILIZANDO                  C 6.9. ACEPTACIÓN DE ANÁLISIS UTILIZANDO  <sub>p.146</sub>

       ELEMENTOS FINITOS                                         ELEMENTOS FINITOS


<a id="c6.9.1"></a>
### 6.9.1 Se permite utilizar un análisis con elementos      C 6.9.1. Este artículo se introdujo para reconocer  <sub>p.146</sub>

finitos para determinar el efecto de las cargas.          explícitamente una metodología de análisis ampliamente
                                                          utilizada.


<a id="c6.9.2"></a>
### 6.9.2 El modelo de elementos finitos debe ser            C 6.9.2. El profesional habilitado debería asegurar que el  <sub>p.146</sub>

apropiado para el propósito que se utilice.               procedimiento de análisis utilizado sea apropiado para el

Reglamento CIRSOC 201-25                                                                                  Cap. 6 - 114


<!-- page 146 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                problema particular de interés. Esto incluye la selección
                                                                del programa de computadora, los tipos de elementos, el
                                                                mallado del modelo y otras hipótesis del análisis.

                                                                Existen diversos programas de computadora para análisis
                                                                por el método de elementos finitos, incluyendo los que
                                                                realizan análisis estáticos, dinámicos, elásticos e
                                                                inelásticos.

                                                                Los tipos de elementos utilizados deberían ser capaces de
                                                                determinar la respuesta requerida. Los modelos de
                                                                elementos finitos pueden incluir: elementos tipo viga-
                                                                columna para modelar elementos de pórticos, como pueden
                                                                ser las vigas y columnas; complementados con elementos
                                                                de tensiones en el plano; elementos de placa; elementos de
                                                                cáscaras o elementos tipo ladrillo, o ambos, que pueden ser
                                                                utilizados para modelar losas de entrepiso, plateas de
                                                                fundación, diafragmas, tabiques y conexiones. El tamaño
                                                                de la red del modelo seleccionado debería ser suficiente
                                                                para determinar el comportamiento de la estructura con el
                                                                nivel de detalle apropiado. Se permite el uso de cualquier
                                                                conjunto de hipótesis razonables para describir la rigidez
                                                                de los elementos.


<a id="c6.9.3"></a>
### 6.9.3 Para análisis inelástico se debe realizar un             C 6.9.3. En un análisis inelástico utilizando elementos  <sub>p.147</sub>

análisis independiente para cada combinación de                 finitos, el principio de superposición lineal no es válido.
mayoración de carga.                                            Para determinar la respuesta inelástica última del elemento,
                                                                por ejemplo, no es correcto determinar los efectos de las
                                                                cargas de servicio y posteriormente combinar linealmente
                                                                los resultados utilizando factores de carga. Debería
                                                                realizarse un análisis inelástico independiente para cada
                                                                combinación de cargas mayoradas.


<a id="c6.9.4"></a>
### 6.9.4 El profesional habilitado debe confirmar que  <sub>p.147</sub>

los resultados son apropiados para el propósito del
análisis.


<a id="c6.9.5"></a>
### 6.9.5 Las dimensiones de la sección transversal de  <sub>p.147</sub>

cada elemento, utilizadas en el análisis, no deben
diferir en más del 10 % de las dimensiones indicadas
en los documentos de construcción; de lo contrario
se debe repetir el análisis.


<a id="c6.9.6"></a>
### 6.9.6 No se permite utilizar redistribución de  <sub>p.147</sub>

momentos calculados por medio de un análisis
inelástico.


<!-- page 147 -->

                   REGLAMENTO    COMENTARIO

Reglamento CIRSOC 201-25                            Cap. 6 - 116


<!-- page 148 -->

                    REGLAMENTO                                                       COMENTARIO
