# CIRSOC 301 (2018) — CAPÍTULO C. PROYECTO POR CONSIDERACIONES DE

> Source: `CIRSOC 301-2018.pdf` · PDF pages 81–86
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

ESTABILIDAD Y RESISTENCIA

Las especificaciones de este Capítulo son aplicables al Proyecto de Estructuras por
consideraciones de estabilidad y resistencia. En él se desarrolla el Método de Análisis
Directo para realizar el análisis estructural. En el Apéndice 7 se presentan métodos
alternativos.

Su contenido está organizado de la siguiente manera:

C.1. Especificaciones generales para la estabilidad de la estructura
C.2. Determinación de las resistencias requeridas por el método de análisis directo
C.3. Determinación de las resistencias de diseño para el método de análisis directo.

C.1.       ESPECIFICACIONES GENERALES PARA LA ESTABILIDAD DE LA
           ESTRUCTURA

Se deberá asegurar la estabilidad global y la resistencia de la estructura, así como la de todos y
cada uno de sus elementos componentes. La estructura además debe tener suficiente rigidez
lateral que limite los desplazamientos laterales. La estabilidad y rigidez pueden ser
proporcionadas por:

(a)    La rigidez lateral propia del plano, la que puede ser provista por alguna de las siguientes
       posibilidades y sus combinaciones :

           Triangulaciones, diagonalizaciones, arriostramientos en K, X, Y, u otros sistemas de
            arriostramiento para pórticos arriostrados en el plano.
           Rigidez flexional de las uniones entre los miembros.
           Columnas en voladizo empotradas en la base.

(b)    La rigidez lateral de planos paralelos al considerado, vinculados al mismo por un sistema
       horizontal de arriostramiento. Dichos planos pueden ser:

           Pórticos arriostrados en su plano.
           Pórticos de nudos rígidos.
           Tabiques de hormigón armado o mampostería, núcleos, o similares.

Los efectos de las acciones sobre la estructura y sus elementos componentes se deberán
determinar por análisis estructural. Con los efectos así determinados se realizarán las
verificaciones de estados límite últimos y de servicio. Todo método de análisis estructural
deberá considerar todos los efectos de:

      (1) Las deformaciones por flexión, corte y esfuerzo axil de los miembros componentes y
          cualquier otra deformación que pueda contribuir a los desplazamientos de la
          estructura.

Reglamento CIRSOC 301-2018                                                            Cap. C - 27


<!-- page 81 -->

      (2) Los efectos de segundo orden (efectos P- y P-) .
      (3) Las imperfecciones geométricas.
      (4) Reducciones de rigidez debidas al comportamiento inelástico.
      (5) Las incertidumbres en la determinación de las rigideces y de las resistencias.

Todos los efectos dependientes de las cargas deberán ser determinados con las
combinaciones de acciones definidas en la Sección B.2..

Se permite cualquier método de análisis estructural que considere todos los efectos
arriba enumerados; ello incluye los especificados en las Secciones C.1.1. y C.1.2..

Se define Proyecto como la combinación de la determinación por análisis estructural de
las solicitaciones de sección y reacciones de vínculo (resistencias requeridas) de los
elementos de la estructura y el dimensionamiento de los mismos para que tengan la
adecuada resistencia de diseño.

En estructuras proyectadas con métodos de análisis global inelástico se deberán
satisfacer las especificaciones del Apéndice 1.

C.1.1. Proyecto por el método de análisis directo (MAD)

Se permite el proyecto de todas las estructuras por el método de análisis directo. El
mismo consiste en determinar las resistencias requeridas según las especificaciones de la
Sección C.2. y las resistencias de diseño según lo especificado en la Sección C.3..

C.1.2. Proyecto por métodos alternativos

Se permiten como alternativas al método de análisis directo, el método de la longitud
efectiva (MLE) y el método de análisis de primer orden (MAPO) definidos en el
Apéndice 7. Los mismos podrán ser aplicados solo en el proyecto de estructuras que
satisfagan las condiciones que se especifican en dicho Apéndice.

C.2. DETERMINACIÓN DE LAS RESISTENCIAS                            REQUERIDAS         POR     EL
     MÉTODO DE ANÁLISIS DIRECTO (MAD)

Para el proyecto de la estructura por el método de análisis directo, las resistencias
requeridas (solicitaciones de sección y reacciones de vínculo) de los elementos
componentes serán determinadas por análisis estructural según lo especificado en la
Sección C.2.1.. El análisis deberá incluir la consideración de las imperfecciones iniciales de
acuerdo con la Sección C.2.2. y ajustes en las rigideces de los elementos componentes
según la Sección C.2.3..

Las resistencias requeridas de los elementos estructurales y sus uniones no serán
inferiores a las determinadas por análisis de primer orden de la estructura sometida a
las acciones mayoradas, y sin considerar las imperfecciones iniciales.

C.2.1. Especificaciones generales del análisis directo

(1)    En estructuras isostáticas las resistencias requeridas de los elementos componentes
       se deberán obtener usando las leyes y ecuaciones de la estática.


<!-- page 82 -->

      En estructuras hiperestáticas las resistencias requeridas de los elementos
      componentes se deberán obtener por análisis global elástico. El mismo se basará en la
      hipótesis de que el diagrama tensión-deformación del acero es lineal, sea cual fuere el
      nivel de tensión. Esta hipótesis podrá ser mantenida, tanto para análisis elástico de primer
      orden como de segundo orden, aún cuando la resistencia de la sección transversal esté
      basada en la resistencia plástica.

(2)   El análisis deberá considerar las deformaciones por flexión, corte y fuerza axil de
      los miembros componentes y cualquier deformación de otro componente o unión que
      pueda contribuir a los desplazamientos de la estructura. El análisis deberá incluir
      reducciones de todas las rigideces que contribuyan a la estabilidad de la estructura
      según se especifica en la Sección C.2.3.

(3)   El análisis global deberá ser de segundo orden considerando los efectos P- y P-.
      Si se utilizan programas computacionales se deberá verificar que los mismos sean
      capaces de realizar un análisis riguroso de segundo orden, o sea que consideren
      los efectos P- y P- en la respuesta de la estructura.

      Se permite no considerar el efecto P- en la respuesta de la estructura (producidos
      por los momentos nodales) cuando se satisfacen las siguientes condiciones:

      (a) La estructura soporta cargas gravitatorias principalmente a traves de columnas
          nominalmente verticales, tabiques o pórticos arriostrados o no arriostrados
          nominalmente verticales.

      (b) La relación entre el máximo desplazamiento lateral relativo de piso de segundo orden
          y el de primer orden (ambos determinados con las combinaciones de acciones
          mayoradas y considerando las rigideces reducidas según la Sección C.2.3.) en todos
          los pisos sea menor o igual que 1,7.

      (c) No más de un tercio de la carga gravitatoria de la estructura sea soportada por
          columnas que formen parte de pórticos rígidos (pórticos no arriostrados o a nudos
          desplazables) en la dirección de traslación considerada.

      Es necesario considerar los efectos P- en la evaluación de todos los elementos
      individuales sometidos a compresión y a flexión por cargas transversales entre sus
      apoyos, cuando los mismos incrementen las resistencias requeridas.

      Para considerar el efecto P- en la evaluación de miembros individuales se puede aplicar
      el factor B1 definido en el Apéndice 8.

      Como una alternativa a un análisis de segundo orden mas riguroso, se permite el uso del
      método aproximado de amplificación de fuerzas y momentos de primer orden definido en
      el Apéndice 8.

(4)   El análisis de segundo orden deberá ser realizado con las combinaciones de acciones
      mayoradas. Se deberán considerar todas las cargas tanto gravitacionales como otras
      cargas aplicadas que puedan influir en la estabilidad de la estructura. En las cargas se
      deben incluir las que actúan sobre las columnas u otros elementos que no aportan rigidez
      lateral al sistema estructural.

Reglamento CIRSOC 301-2018                                                            Cap. C - 29


<!-- page 83 -->

C.2.2. Consideración de las imperfecciones iniciales

En el análisis se debe considerar el efecto de las imperfecciones iniciales en la estabilidad de
la estructura y en las resistencias requeridas de sus componentes, para lo cual se puede
proceder de la siguiente manera:

    (1) modelando directamente las imperfecciones en el análisis, tal como se especifica en la
        Sección C.2.2 (a) ó,

    (2) usando cargas ficticias como se indica en la Sección C.2.2 (b).

Las imperfecciones a considerar serán las imperfecciones en la localización de los puntos de
intersección de los miembros de la estructura tales como el desplome de las columnas
teóricamente verticales en estructuras de edificios.

La curvatura inicial de los miembros comprimidos está considerada en la curva de pandeo
utilizada en el Capítulo E, por lo que no se debe considerar en el análisis global esta
imperfección, a excepción de que la misma supere el límite adoptado para la determinación de
dicha curvatura.

C.2.2 (a). Modelado directo de las imperfecciones

En todos los casos se permite considerar el efecto de las imperfecciones iniciales incluyendo
las mismas en el análisis estructural. La estructura deberá ser analizada con los puntos de
intersección de sus miembros (nudos) desplazados respecto de su ubicación nominal. El
valor de los desplazamientos iniciales será la máxima tolerancia permitida para la
construcción y su disposición será tal que produzca el máximo efecto desestabilizador. La
modelación de las imperfecciones deberá tener una configuración similar a los
desplazamientos debidos a las cargas actuantes y a los modos de pandeo, previsibles en la
estructura.

En estructuras que soportan cargas gravitatorias fundamentalmente a través de columnas
nominalmente verticales, tabiques o pórticos, y donde la relación entre los desplazamientos
máximos de segundo y de primer orden debidos a las cargas mayoradas y obtenidos con las
rigideces reducidas, sea menor o igual que 1,7, se permite considerar las imperfecciones
iniciales sólo en aquellas combinaciones de acciones mayoradas que incluyan solamente
cargas gravitatorias, no siendo necesario hacerlo en aquellas combinaciones de acciones
que incluyan cargas laterales.

C.2.2 (b). Uso de cargas ficticias para representar las imperfecciones

Se permite el uso de cargas ficticias con las especificaciones dadas en esta Sección (ver
puntos del (1) al (4)) para representar los efectos de las imperfecciones iniciales, en
estructuras que soportan cargas gravitatorias fundamentalmente a través de columnas
nominalmente verticales, tabiques o pórticos. Las cargas ficticias deberán ser aplicadas en
el modelo de la estructura con la geometría nominal inicial.

(1) Las cargas ficticias deberán ser aplicadas como cargas laterales en todos los niveles.
    Ellas deberán ser adicionadas a las otras cargas laterales consideradas y deberán
    incorporarse en las combinaciones de cargas correspondientes, a excepción de lo
    especificado en (4). La intensidad de las cargas ficticias será:


<!-- page 84 -->

                                 Ni = 0,002 Yi

   siendo:
             Ni la carga ficticia aplicada en el nivel i, en kN,

             Yi la carga gravitacional mayorada aplicada en el nivel i, en kN.

   El corte basal sobre las fundaciones resultante de las cargas ficticias no debe ser
   considerado para el diseño de las mismas. Los momentos de vuelco adicionales y sus
   efectos, resultantes de las cargas ficticias, deberán ser considerados.

(2) Las cargas ficticias en cada nivel deberán ser distribuidas entre los elementos
    estructurales en cada nivel, de manera proporcional a la distribución de las cargas
    gravitatorias aplicadas en el nivel. Las cargas ficticias deberán ser aplicadas en la
    dirección y en el sentido que produzca el mayor efecto desestabilizante. En la mayoría
    de las estructuras de edificios ello implica: (a) para combinaciones de acciones que no
    incluyen cargas laterales, aplicar las cargas ficiticias en dos direcciones no coincidentes
    y en ambos sentidos. La dirección y el sentido deben ser los mismos en todos los
    niveles. (b) para combinaciones de acciones que incluyan cargas laterales considerar las
    cargas ficticias en la dirección y el sentido de la resultante de todas las cargas laterales
    actuantes en la combinación de acciones considerada.

(3) El factor 0,002 para determinar la carga ficticia resulta de considerar un desplome inicial
    de H/500, máximo permitido por este Reglamento. Para casos en que el desplome inicial
    resulte justificadamente diferente se deberá ajustar el coeficente en forma proporcional.

(4) Para estructuras donde la relación entre los desplazamientos máximos de segundo y de
    primer orden debidos a las cargas mayoradas, y obtenidos con las rigideces reducidas
    según se especifica en la Sección C.2.3., sea menor o igual que 1,7, se permite aplicar
    la carga ficticia Ni sólo en aquellas combinaciones de acciones mayoradas que incluyan
    solamente cargas gravitatorias, no siendo necesario hacerlo en aquellas combinaciones
    de acciones que incluyan cargas laterales.

C.2.3. Ajustes en la rigidez

En el análisis estructural para la determinación de las resistencias requeridas de los distintos
miembros de la estructura se deberán utilizar rigideces reducidas según se especifica a
continuación:

(1) Se deberá aplicar un factor de reducción igual a 0,80 a todas las rigideces de los
    elementos estructurales.

(2) Se deberá aplicar un factor de reducción adicional b a la rigidez a flexión de todos los
    miembros de la estructura cuya rigidez a flexión contribuya a la estabilidad de la
    estructura.

       (a) Cuando (Pu / Py )  0,5                      b = 1                              (C.2.2a)

       (b) Cuando (Pu / Py ) > 0,5                      b = 4 (Pu / Py ) [ 1-(Pu / Py )]   (C.2.2b)

Reglamento CIRSOC 301-2018                                                                  Cap. C - 31


<!-- page 85 -->

siendo:

        Pu la resistencia requerida a compresión axil del miembro, en kN,

        Py la resistencia nominal a compresión por fluencia = Fy. Ag (10)-1 , en kN.

(3) En aquellas estructuras que cumplen los requisitos indicados en la Sección C.2.2 (b)
    podrá tomarse b = 1 en lugar de b < 1, cuando ello corresponda según la Seccción
    C.2.2(2), si se aplica en todos los niveles una carga ficticia 0,001 Yi aplicada según se
    especifica en la Sección C.2.2(b)(2) y en todas las combinaciones de acciones. Estas
    cargas ficticias deberán adicionarse a las determinadas por la Sección C.2.2(b)(1)
    cuando estas se utilicen para considerar las imperfecciones iniciales. En este caso no es
    de aplicación lo especificado en la Sección C.2.2(b)(4).

(4) Cuando existan miembros compuestos acero-hormigón o de otros materiales que
    contribuyan a la estabilidad de la estructura, deberán ser aplicados a estos miembros los
    factores de reducción que especifiquen los respectivos Reglamentos para esos
    materiales.

C.3.      DETERMINACIÓN DE LAS RESISTENCIAS DE DISEÑO PARA EL
          MÉTODO DE ANÁLISIS DIRECTO

Cuando se utilice el método de análisis directo para determinar las resistencias requeridas,
las resistencias de diseño de los miembros de la estructura y sus uniones serán
determinadas con las especificaciones de los Capítulos D, E, F, G, H, y J según
corresponda, sin consideraciones adicionales sobre la estabilidad de la estructura. El factor
de longitud efectiva k se tomará k = 1 a menos que un valor menor pueda ser justificado
mediante un análisis racional.

Los arriostramientos utilizados para definir longitudes no arriostradas de los miembros de la
estructura deberán tener la suficiente rigidez y resistencia para controlar los movimientos del
miembro en los puntos que arriostran.

Los métodos para satisfacer los requisitos de los arriostramientos de columnas , vigas y
vigas-columnas y pórticos arriostrados se especifican en el Apéndice 6. Las
especificaciones del Apéndice 6 no se aplicarán a los arriostramientos que son
incluidos como parte del sistema estructural en el análisis de la estructura completa.


<!-- page 86 -->
