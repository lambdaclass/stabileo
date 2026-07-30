# CIRSOC 301 (2018) — APÉNDICE 7. MÉTODOS                 ALTERNATIVOS PARA EL

> Source: `CIRSOC 301-2018.pdf` · PDF pages 311–320
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

PROYECTO POR CONSIDERACIONES DE
                          ESTABILIDAD Y RESISTENCIA

En este Apéndice se presentan métodos alternativos al método de análisis directo
para el proyecto por consideraciones de estabilidad y resistencia definido en el
Capítulo C de este Reglamento.

Los métodos alternativos incluidos en este Apéndice son: Método de la longitud efectiva y
Método de análisis de primer orden.

Su contenido está organizado de la siguiente manera:


<a id="c7.1"></a>
### 7.1 Especificaciones generales para la estabilidad de la estructura  <sub>p.311</sub>


<a id="c7.2"></a>
### 7.2 Método de la longitud efectiva (MLE)  <sub>p.311</sub>


<a id="c7.3"></a>
### 7.3 Método de análisis de primer orden (MAPO)  <sub>p.311</sub>



<a id="c7.1"></a>
### 7.1 ESPECIFICACIONES GENERALES PARA LA ESTABILIDAD DE LA ES-  <sub>p.311</sub>

     TRUCTURA

Se deberá asegurar la estabilidad global y la resistencia de la estructura como la de todos y
cada uno de sus elementos componentes. La estructura además deberá tener suficiente rigidez
lateral que limite los desplazamientos laterales. La estabilidad y rigidez pueden ser provistas
por:

(a) La rigidez lateral propia del plano, la que puede ser provista por alguna de las siguientes
    posibilidades:

   Triangulaciones, diagonalizaciones, arriostramientos en K, X, Y, u otros sistemas de
    arriostramiento para pórticos arriostrados en el plano.
   Rigidez de las uniones entre las barras.
   Columnas en voladizo empotradas en la base.

(b) La rigidez lateral de planos paralelos al considerado, vinculados al mismo por un sistema
    horizontal de arriostramiento. Dichos planos pueden ser:

          Pórticos arriostrados en su plano.
          Pórticos de nudos rígidos.
          Tabiques de hormigón armado o mampostería, núcleos, o similares.

Los efectos de las acciones sobre la estructura y sus elementos componentes se
determinarán por análisis estructural. Con los efectos así determinados, se realizarán las
verificaciones de estados límite últimos y de servicio.

Reglamento CIRSOC 301 – 2018                                                   Apéndice 7 - 257


<!-- page 311 -->

Todos los efectos dependientes de las cargas deberán ser determinados con las
combinaciones de acciones mayoradas definidas en la Sección B.2..

Como alternativa al metodo de análisis directo especificado en las Secciones C.1.1., C.2. y
C.3., se permite el proyecto de estructuras por estabilidad y resistencia ya sea con el
método de la longitud efectiva especificacado en la Sección 7.2. o con el método de
análisis de primer orden especificado en la Sección 7.3., con las limitaciones especificadas
en cada caso en dichas Secciones.


<a id="c7.2"></a>
### 7.2 MÉTODO DE LA LONGITUD EFECTIVA (MLE)  <sub>p.312</sub>



<a id="c7.2.1"></a>
### 7.2.1 Limitaciones  <sub>p.312</sub>


El uso del método de la longitud efectiva estará limitado a los casos que satisfagan las
siguientes condiciones:

    (1) La estructura soporta las cargas gravitacionales primariamente a través de
        columnas, tabiques o pórticos todos nominalmente verticales.

    (2) La relación, en todos los pisos, entre los máximos desplazamientos de segundo
        orden y de primer orden determinados por las combinaciones de acciones
        mayoradas, sea menor o igual a 1,5.

La relación, en un piso, entre los desplazamientos de segundo orden y de primer orden
puede tomarse igual al factor de amplificacion de momentos de primer orden B2
determinado con las especificaciones del Apéndice 8.


<a id="c7.2.2"></a>
### 7.2.2 Determinación de las resistencias requeridas  <sub>p.312</sub>


(a) General

Para el proyecto de la estructura por el método de la longitud efectiva, las resistencias
requeridas (solicitaciones de sección y reacciones de vínculo) de los elementos
componentes serán determinadas por análisis estructural según lo especificado en esta
Sección.

Las resistencias requeridas de los elementos estructurales y sus uniones no serán
inferiores a las determinadas por análisis de primer orden de la estructura sometida a
las acciones mayoradas, y sin considerar las imperfecciones iniciales.

  (1)   En estructuras isostáticas las resistencias requeridas de los elementos componentes se
        deberán obtener usando las leyes y expresiones de la estática.

        En estructuras hiperestáticas las resistencias requeridas de los elementos componentes
        se deberán obtener por análisis global elástico. El mismo se basará en la hipótesis de
        que el diagrama tensión-deformación del acero es lineal, sea cual fuere el nivel de
        tensión. Esta hipótesis podrá ser mantenida, tanto para análisis elástico de primer orden
        como de segundo orden, aún cuando la resistencia de la sección transversal esté
        basada en la resistencia plástica.


<!-- page 312 -->

 (2)   El análisis deberá considerar las deformaciones por flexión, corte y fuerza axil de los
       miembros componentes y cualquier deformación de otro componente o unión que
       pueda contribuir a los desplazamientos de la estructura. se utilizará para el análisis
       la rigidez nominal de los componentes de acero estructural que contribuyan a
       la estabilidad de la estructura (EI y EA).

 (3)   El análisis global deberá ser de segundo orden considerando los efectos P- y
       P-.

       Si se utilizan programas computacionales se deberá verificar que los mismos sean
       capaces de realizar un análisis riguroso de segundo orden o sea consideren los
       efectos P- y P- en la respuesta de la estructura.

       Se permite no considerar el efecto P- en la respuesta de la estructura cuando se
       satisfacen las siguientes condiciones:

       (a) La estructura soporta cargas gravitatorias principalmente a través de columnas
           nominalmente verticales, tabiques o pórticos arriostrados o no arriostrados
           nominalmente verticales

       (b) No más de un tercio de la carga gravitatoria de la estructura es soportada por
           columnas que son parte de pórticos rígidos (pórticos no arriostrados o a nudos
           desplazables) en la dirección de traslación considerada.

           Es necesario considerar los efectos P- en la evaluación de todos los
           elementos individuales sometidos a compresión y a flexión por cargas
           transversales entre sus apoyos, cuando los mismos incrementen las
           resistencias requeridas.

           Para considerar el efecto P- en la evaluación de miembros individuales puede
           aplicarse el factor B1 definido en el Apéndice 8 de este Reglamento.

           Como una alternativa a un análisis de segundo orden más riguroso, se permite el
           uso del método aproximado de amplificación de momentos de primer orden definido
           en el Apéndice 8.

 (4)   El análisis de segundo orden deberá ser realizado con las combinaciones de
       acciones mayoradas. Se deben considerar todas las cargas tanto gravitacionales
       como otras cargas aplicadas que puedan influir en la estabilidad de la estructura. En las
       cargas se deben incluir las que actúan sobre las columnas u otros elementos que
       no aportan rigidez lateral al sistema estructural.

 (5)   El análisis deberá incluir la consideración de las imperfecciones iniciales de
       acuerdo con las especificaciones de la Sección C.2.2(b), o sea con la inclusión de
       cargas ficticias aplicadas en el modelo de la estructura con la geometría nominal
       inicial.

       Se permite aplicar la carga ficticia Ni sólo en aquellas combinaciones de acciones
       mayoradas que incluyan solamente cargas gravitatorias, no siendo necesario hacerlo
       en aquellas combinaciones de acciones que incluyan cargas laterales.

Reglamento CIRSOC 301 – 2018                                                    Apéndice 7 - 259


<!-- page 313 -->

(b) Estructuras trianguladas

        Para el análisis estructural de estructuras trianguladas, tales como vigas reticuladas o
        planos de contraviento o rigidización triangulados, se deberán satisfacer las
        especificaciones aplicables de la Sección 7.2.2(a). Se deberá considerar si aquellas son
        interiormente isostáticas o hiperestáticas según la rigidez de los nudos y la esbeltez
        relativa de las barras que la componen. La hipótesis de barras articuladas en sus
        extremos, comúnmente utilizada para el análisis estructural de estas estructuras, debe
        ser consistente con la capacidad de giro de las secciones extremas de las barras de la
        estructura proyectada.


<a id="c7.2.3"></a>
### 7.2.3 Determinación de las resistencias de diseño  <sub>p.314</sub>


Las resistencias de diseño de los miembros de la estructura y sus uniones serán
determinadas con las especificaciones de los Capítulos D, E, F, G, H, y J según
corresponda.

El factor de longitud efectiva k de miembros sometidos a compresión será determinado de
la siguiente forma:

(1)   En sistemas de pórticos arriostrados (nudos no desplazables), sistemas de tabiques
      de corte, sistemas de reticulados y otros sistemas estructurales cuya estabilidad lateral
      y resistencia a las cargas laterales no recae en la rigidez a flexión de las columnas y
      en la unión rígida de vigas y columnas, el factor de longitud efectiva k para barras
      comprimidas se deberá tomar k = 1,0, a menos que un análisis estructural demuestre que
      se puede adoptar un valor menor.

      En pórticos arrriostrados de varios pisos, el sistema vertical de arriostramiento deberá ser
      resuelto por análisis estructural.

      Dicho sistema vertical deberá asegurar que la estructura no pandee y que mantenga su
      estabilidad lateral incluso frente a los efectos de vuelco producidos por los
      desplazamientos laterales, cuando en aquella actúan las acciones mayoradas dadas en
      la Sección B.2..

      El sistema vertical de arriostramiento para pórticos arriostrados de varios pisos, puede ser
      considerado como actuando en conjunto con tabiques exteriores o interiores, losas de
      piso y cubiertas de techo siempre que las mismas estén adecuadamente unidas a los
      pórticos.

      Para el análisis del pandeo y la estabilidad lateral de los pórticos arriostrados, las
      columnas, vigas, vigas armadas y barras diagonales que formen parte de un plano del
      sistema vertical de arriostramiento pueden ser consideradas como integrantes de una
      viga reticulada en voladizo con nudos articulados. La deformación axil de todas las barras
      del sistema vertical de arriostramiento deberá ser incluida en el análisis de la estabilidad
      lateral.

(2)   En sistemas de pórticos no arriostrados (a nudos desplazables) u otros sistemas
      estructurales cuya estabilidad lateral depende de la rigidez a flexión de las columnas y
      de la rigidez a flexión de la unión rígida de vigas y columnas, el factor de longitud


<!-- page 314 -->

     efectiva k o la tensión crítica elástica Fe para barras comprimidas que aportan rigidez
     lateral y resistencia a cargas laterales, será determinado por análisis de pandeo lateral
     de la estructura.

     Los efectos desestabilizantes de columnas sometidas a cargas gravitatorias que por
     estar biarticuladas al pórtico no aportan rigidez lateral, deberán ser incluidos en el
     dimensionamiento de las columnas del pórtico que aportan rigidez lateral al mismo. Para
     las columnas que no aportan rigidez lateral se tomará k = 1,0.

     Se podrá realizar la corrección por inelasticidad de la rigidez de las columnas del pórtico.

     En el análisis de la resistencia requerida en pórticos no arriostrados de varios pisos se
     deberán incluir los efectos de la inestabilidad del pórtico y de la deformación axil de sus
     columnas, cuando actúen las acciones mayoradas dadas en la Sección B.2..

   Excepción: Si en todos los pisos la relación entre los desplazamientos máximos de
    segundo orden y de primer orden determinados con las combinaciones de acciones
    mayoradas es igual o menor a 1,1, se permite usar k = 1,0 para el proyecto de todas
    las columnas.

   Métodos para determinar el factor de longitud efectiva k en elementos de pórticos
    arriostrados y no arriostrados se incluyen en los Comentarios al Apéndice 7.

   Los elementos del sistema horizontal de arriostramiento, cuya finalidad sea definir las
    longitudes no arriostradas de los miembros, deberán tener suficiente rigidez y resistencia
    para controlar los movimientos de aquellos en los puntos arriostrados. Serán
    proyectados para resistir los efectos producidos por las cargas mayoradas que actúen
    sobre los pórticos arriostrados y los efectos resultantes de la estabilización de los
    pórticos que arriostran.

    Métodos para satisfacer los requisitos de los arriostramientos son dados en el Apéndice
    6.

    Las especificaciones del Apéndice 6 no son aplicables a los arriostramientos que
    estén incluidos como parte del sistema estructural resistente en el análisis global de la
    estructura.

(3) En estructuras trianguladas:

    (a) En estructuras trianguladas interiormente hiperestáticas (barras no articuladas) el
        factor de longitud efectiva k, para el pandeo en el plano del reticulado, será
        determinado según lo establecido en (1) para pórticos arriostrados (de nudos
        indesplazables) o en (2) para pórticos no arriostrados (de nudos desplazables) según
        corresponda.

       El factor de longitud efectiva k, para el pandeo fuera del plano del reticulado, se
       determinará según lo especificado en (3)(b) para estructuras trianguladas interiormente
       isostáticas.

Reglamento CIRSOC 301 – 2018                                                      Apéndice 7 - 261


<!-- page 315 -->

    (b) En estructuras trianguladas interiormente isostáticas (barras articuladas en sus
        extremos) el factor de longitud efectiva k para el pandeo fuera del plano del
        reticulado, se determinará de la siguiente manera:

               cordones y diagonales extremas de vigas trapeciales:

                                                   k = L1 / L

        siendo:
                   L1 la distancia entre puntos no desplazables lateralmente por efecto del
                      sistema de arriostramiento lateral, en cm.

                   L   la longitud real de la barra. (distancia entre nudos), en cm.

        Se deberá prestar especial atención cuando por los efectos de alguna combinación de
        carga, resulten comprimidos los cordones inferiores de vigas reticuladas.

        En cordones continuos con distinta carga axil en sus tramos, si los nudos extremos son
        indesplazables lateralmente en ambas direcciones (ver Figura 7.2.1.):

                                 k = 0,75 + 0,25 P2 / P1         con P1 > P2 (en valor absoluto)

                          Figura 7.2.1. Cordones con distinta carga axil.

       diagonales y montantes:

            -      Si los nudos extremos no se pueden desplazar lateralmente: k = 1
            -      En montantes continuos con distinta carga axil en sus tramos, si los nudos
                   extremos son indesplazables en ambas direcciones (ver Figura 7.2.2.):

                                k = 0,75 + 0,25 P2 / P1          con P1 > P2 (en valor absoluto)


<!-- page 316 -->

                           Figura 7.2.2. Montantes con distinta carga axil.

           -   En diagonales comprimidas, con nudos extremos indesplazables y unidas en su
               centro a una diagonal traccionada (ver Figura 7.2.3.).
                               k  1  0,75  Pt Pc  0,5
           -

               Figura 7.2.3. Diagonal comprimida unida a diagonal traccionada.

      En cordones, diagonales y montantes con un nudo extremo apoyado
       elásticamente en sentido perpendicular al plano el reticulado, o que forman parte de un
       semipórtico transversal al plano del reticulado y cuya estabilidad depende de su rigidez
       a flexión, k se determinará por análisis estructural.

(c) En estructuras trianguladas interiormente isostáticas (barras articuladas en sus
    extremos), el factor de longitud efectiva k para el pandeo en el plano del reticulado, se
    determinará según lo indicado en la Figura 7.2.4..

Reglamento CIRSOC 301 – 2018                                                   Apéndice 7 - 263


<!-- page 317 -->

 Observaciones:

 (1) Para uniones abulonadas se deben colocar como mínimo dos bulones. Si la unión tiene sólo un bulón se
     tomará k = 1,00.
 (2) En casos particulares, y en función de la restricción de las uniones (por ejemplo ciertos casos de barras de
     tubos de sección circular o rectangular con uniones rígidas), se podrá tomar un valor menor para k, pero
     nunca menor que 0,75, y siempre que se justifique por análisis estructural el valor adoptado.
 (3) Para barras de angular único unido a la chapa de nudo por una cara con dos bulones como mínimo, ó dos
     cordones de soldadura longitudinales, ver la Sección E.5. para despreciar el efecto de la excentricidad y
     considerar sólo la fuerza axil
     Si la unión se realiza con un solo bulón se deberá considerar el momento debido a la excentricidad junto
     con la fuerza axil para el dimensionado de la barra, y se deberá adoptar k =1,00.

   Figura 7.2.4. Factor de longitud efectiva k para pandeo en el plano del reticulado.


<!-- page 318 -->


<a id="c7.3"></a>
### 7.3 MÉTODO DE ANÁLISIS DE PRIMER ORDEN  <sub>p.319</sub>



<a id="c7.3.1"></a>
### 7.3.1 Limitaciones  <sub>p.319</sub>


El uso del método de análisis de primer orden estará limitado a los casos que satisfagan las
siguientes condiciones:

   (1) La estructura soportará las cargas gravitacionales primariamente a través de
       columnas, tabiques o pórticos todos nominalmente verticales

   (2) La relación, en todos los pisos, entre los máximos desplazamientos de segundo
       orden y del primer orden determinados por las combinaciones de acciones
       mayoradas, será menor o igual que 1,5.

       La relación, en un piso, entre los desplazamientos de segundo orden y de primer
       orden podrá adoptarse igual al factor de amplificacion de momentos de primer orden
       B2 determinado con las especificaciones del Apéndice 8..

   (3) La resistencia requerida a compresión axil de todos los miembros, cuyas rigideces a
       flexión contribuyan a la estabilidad lateral de la estructura, deberá satisfacer la
       siguiente limitación:

                                Pu  0 , 5 P y                                           (7.1)
       siendo:

                  Pu la resistencia requerida a compresión axil, en kN.

                  Py la resistenca axil nominal de fluencia, en kN.


<a id="c7.3.2"></a>
### 7.3.2 Determinación de las resistencias requeridas  <sub>p.319</sub>


Las resistencias requeridas de todos los miembros componentes serán determinadas por un
análisis de primer orden con los requerimientos adicionales (1) y (2) especificados a
continuación. El análisis deberá considerar los deformaciones de flexión, de corte y axil de
los miembros y todas las deformaciones que contribuyan al desplazamiento de la estructura.

Se utilizará para el análisis la rigidez nominal de los componentes de acero
estructural que contribuyan a la estabilidad de la estructura (EI y EA).

(1) Todas las combinaciones de carga deberán incluir una carga lateral adicional Ni
    aplicada en cada nivel de la estructura en combinación con las otras cargas:

                                N i  2 , 1 (  / L ) Y i  0 , 0042 Y i                  (7.2)

   siendo:

             Yi      la carga gravitatoria aplicada en el i-ésimo nivel para las combinaciones
                     de cargas mayoradas, en kN.

Reglamento CIRSOC 301 – 2018                                                   Apéndice 7 - 265


<!-- page 319 -->

             /L     la máxima relación entre  y L entre todos los pisos de la estructura.

                    el desplazamiento relativo de piso de primer orden debido a las
                     combinaciones de carga mayoradas. Cuando existan desplazamientos
                     relativos distintos en el área en planta de la estructura se podrá adoptar el
                     promedio ponderado de ellos en proporción a la carga gravitatoria o
                     alternativamente el máximo desplazamiento relativo, en cm.

            L        la altura de piso correspondiente al  analizado, en cm.

    Las cargas ficticias en cada nivel deberán ser distribuidas entre los elementos
    estructurales de cada nivel, de manera proporcional a la distribución de las cargas
    gravitatorias aplicadas en el nivel. Las cargas ficticias deberán ser aplicadas en la
    dirección y en el sentido que produzca el mayor efecto desestabilizante. En la mayoría
    de las estructuras de edificios ello implica:

      (a) para combinaciones de acciones que no incluyen cargas laterales, aplicar las
          cargas ficticias en dos direcciones no coincidentes y en ambos sentidos. La
          dirección y el sentido deben ser los mismos en todos los niveles.

      (b) para combinaciones de acciones que incluyan cargas laterales considerar las
          cargas ficticias en la dirección y el sentido de la resultante de todas las cargas
          laterales actuantes en la combinación de acciones considerada.

(2) La amplificación de los momentos requeridos de primer orden de las vigas columnas en
    la hipótesis de pórtico no desplazable será considerada aplicando el factor B1
    especificado en el Apéndice 8 a los momentos flectores de todas las columnas del piso.

Las resistencias requeridas de los elementos estructurales y sus uniones no serán
inferiores a las determinadas por análisis de primer orden de la estructura sometida a
las acciones mayoradas, y sin considerar las cargas laterales adicionales.


<a id="c7.3.3"></a>
### 7.3.3 Determinación de las resistencias de diseño  <sub>p.320</sub>


Las resistencias de diseño de los miembros de la estructura y sus uniones serán
determinadas con las especificaciones de los Capítulos D, E, F, G, H, y J según
corresponda.

El factor de longitud efectiva k de miembros sometidos a compresión será tomado k = 1 .

Los elementos del sistema horizontal de arriostramiento cuya finalidad es definir las
longitudes no arriostradas de los miembros, deberán tener suficiente rigidez y resistencia
para controlar los movimientos de aquellos en los puntos arriostrados. Serán proyectados
para resistir los efectos producidos por las cargas mayoradas que actúen sobre los pórticos
arriostrados y los efectos resultantes de la estabilización de los pórticos que arriostran.

En el Apéndice 6 se especifican los métodos para satisfacer los requisitos de los
arriostramientos. Las especificaciones del Apéndice 6 no son aplicables a los
arriostramientos que estén incluidos como parte del sistema estructural resistente en
el análisis global de la estructura.


<!-- page 320 -->
