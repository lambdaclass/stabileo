import type { PublicLocale } from '../i18n/store.svelte';

export type ChangelogArea = 'basic' | 'pro' | 'edu' | 'app' | 'engine' | 'site';

export const CHANGELOG_AREAS: readonly ChangelogArea[] = ['basic', 'pro', 'edu', 'app', 'engine', 'site'];

export type ChangelogShot = {
  /** A stem under /screenshots, served by Shot.svelte at 800 and 1600 px. */
  base: string;
  w: number;
  h: number;
  alt: Record<PublicLocale, string>;
};

export type ChangelogEntry = {
  /** The Friday of the weekly report, or the first day of the month for a monthly entry. */
  date: string;
  /** Before the weekly reports started in June 2026, the history is told a month at a time. */
  period?: 'month';
  /** Areas of the items, in order: `items` in every language follows it. */
  areas: ChangelogArea[];
  shot?: ChangelogShot;
  i18n: Record<PublicLocale, { title: string; items: string[] }>;
};

/**
 * What reached stabileo.com, newest first. From June 2026 one entry per weekly report, dated with
 * the report's Friday and listing only what was merged to main that week; before that, one entry
 * per month, from the first commit on 10 February 2026.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-10-23',
    areas: ['engine', 'engine', 'app', 'site', 'site'],
    i18n: {
      es: {
        title: 'Verificaciones en el motor y versiones 0.2.0 y 0.3.0',
        items: [
          'Las verificaciones de hormigón armado (CIRSOC 201) y de acero (CIRSOC 301) pasaron a calcularse dentro del motor, con baterías de validación contra modelos de referencia publicados.',
          'Para los resultados que lo admiten, el motor calcula una cota de error con aritmética de intervalos.',
          'Se publicaron las versiones 0.2.0 y 0.3.0, con notas en español, inglés y portugués. Cuando un cambio afecta resultados, la app avisa para volver a calcular los proyectos guardados.',
          'La landing suma una sección sobre verificación y ahora carga 152 KB en lugar de 6,4 MB.',
          'Dos notas nuevas en el blog, un índice rediseñado y una página que detalla qué verifica Stabileo de cada reglamento CIRSOC.',
        ],
      },
      en: {
        title: 'Design checks in the engine, and versions 0.2.0 and 0.3.0',
        items: [
          'Reinforced concrete (CIRSOC 201) and steel (CIRSOC 301) design-code checks now run inside the engine, with validation suites against published reference models.',
          'For the results that allow it, the engine computes an error bound with interval arithmetic.',
          'Versions 0.2.0 and 0.3.0 were released, with notes in Spanish, English and Portuguese. When a change affects results, the app asks you to re-run your saved projects.',
          'The landing page adds a section on verification and now loads 152 KB instead of 6.4 MB.',
          'Two new blog posts, a redesigned index, and a page listing what Stabileo checks from each CIRSOC code.',
        ],
      },
      pt: {
        title: 'Verificações no motor e versões 0.2.0 e 0.3.0',
        items: [
          'As verificações de concreto armado (CIRSOC 201) e de aço (CIRSOC 301) passaram a ser calculadas dentro do motor, com baterias de validação contra modelos de referência publicados.',
          'Para os resultados que permitem, o motor calcula um limite de erro com aritmética de intervalos.',
          'Foram publicadas as versões 0.2.0 e 0.3.0, com notas em espanhol, inglês e português. Quando uma mudança afeta resultados, o app avisa para recalcular os projetos salvos.',
          'A landing ganhou uma seção sobre verificação e agora carrega 152 KB em vez de 6,4 MB.',
          'Dois artigos novos no blog, um índice redesenhado e uma página que detalha o que o Stabileo verifica de cada norma CIRSOC.',
        ],
      },
      de: {
        title: 'Nachweise im Rechenkern und die Versionen 0.2.0 und 0.3.0',
        items: [
          'Die Nachweise für Stahlbeton (CIRSOC 201) und Stahl (CIRSOC 301) laufen jetzt im Rechenkern, mit Validierungsreihen an veröffentlichten Referenzmodellen.',
          'Für die Ergebnisse, die es zulassen, berechnet der Rechenkern mit Intervallarithmetik eine Fehlerschranke.',
          'Die Versionen 0.2.0 und 0.3.0 sind erschienen, mit Versionshinweisen auf Spanisch, Englisch und Portugiesisch. Betrifft eine Änderung Ergebnisse, weist die App darauf hin, gespeicherte Projekte neu zu berechnen.',
          'Die Startseite erhält einen Abschnitt zur Verifikation und lädt jetzt 152 KB statt 6,4 MB.',
          'Zwei neue Blogbeiträge, ein überarbeitetes Verzeichnis und eine Seite, die zeigt, was Stabileo aus jeder CIRSOC-Norm nachweist.',
        ],
      },
      fr: {
        title: 'Les vérifications dans le moteur, et les versions 0.2.0 et 0.3.0',
        items: [
          'Les vérifications du béton armé (CIRSOC 201) et de l\'acier (CIRSOC 301) sont désormais calculées dans le moteur, avec des séries de validation sur des modèles de référence publiés.',
          'Pour les résultats qui s\'y prêtent, le moteur calcule une borne d\'erreur par arithmétique d\'intervalles.',
          'Les versions 0.2.0 et 0.3.0 sont sorties, avec des notes en espagnol, en anglais et en portugais. Quand une modification touche les résultats, l\'application invite à recalculer les projets enregistrés.',
          'La page d\'accueil gagne une section sur la vérification et ne charge plus que 152 Ko au lieu de 6,4 Mo.',
          'Deux nouveaux articles de blog, un sommaire repensé et une page qui détaille ce que Stabileo vérifie de chaque règlement CIRSOC.',
        ],
      },
      tr: {
        title: 'Motorda kontroller ve 0.2.0 ile 0.3.0 sürümleri',
        items: [
          'Betonarme (CIRSOC 201) ve çelik (CIRSOC 301) kontrolleri artık motorun içinde hesaplanıyor; yayımlanmış referans modellere karşı doğrulama setleri de var.',
          'İzin veren sonuçlar için motor, aralık aritmetiğiyle bir hata sınırı hesaplıyor.',
          '0.2.0 ve 0.3.0 sürümleri İspanyolca, İngilizce ve Portekizce notlarla yayımlandı. Bir değişiklik sonuçları etkilediğinde uygulama, kayıtlı projelerin yeniden hesaplanması için uyarıyor.',
          'Açılış sayfasına doğrulama üzerine bir bölüm eklendi ve sayfa artık 6,4 MB yerine 152 KB yükleniyor.',
          'Blogda iki yeni yazı, yeniden tasarlanmış bir dizin ve Stabileo\'nun her CIRSOC yönetmeliğinden neyi kontrol ettiğini ayrıntılı anlatan bir sayfa.',
        ],
      },
    },
  },
  {
    date: '2026-10-16',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro'],
    shot: {
      base: 'changelog-basic-report',
      w: 1600,
      h: 1000,
      alt: {
        es: 'El diálogo del informe de cálculo del modo Básico, con la lista de contenidos para elegir qué incluir',
        en: 'The Basic mode calculation report dialog, with the list of contents to choose what to include',
        pt: 'O diálogo do relatório de cálculo do modo Básico, com a lista de conteúdos para escolher o que incluir',
        de: 'Der Dialog der statischen Berechnung im Basis-Modus, mit der Inhaltsliste, in der man auswählt, was aufgenommen wird',
        fr: 'La boîte de dialogue de la note de calcul du mode Basique, avec la liste des contenus où l\'on choisit ce qu\'elle inclut',
        tr: 'Temel modundaki hesap raporu iletişim kutusu; neyin dahil edileceğini seçmek için içerik listesiyle',
      },
    },
    i18n: {
      es: {
        title: 'Informe a medida en el Básico y cargas dinámicas en el PRO',
        items: [
          'Zoom de kilómetros a milímetros, selección de barras superpuestas, ocultar partes del modelo y etiquetas más legibles.',
          'El informe de cálculo en PDF se arma eligiendo qué incluir, entre otras cosas el análisis cinemático y el despiece equilibrado, y las figuras se exportan listas para imprimir.',
          'Un video que muestra la estructura construyéndose piso por piso.',
          'Casos de carga compuestos y de referencia, cargas nocionales y combinaciones por SRSS y ABS.',
          'Cargas dinámicas y móviles: espectros de respuesta propios del proyecto y vehículos de catálogo.',
          'Unidades en todo el PRO y exportaciones a Excel, CSV, informe PDF, DXF e imágenes, cada una con un diálogo que muestra qué sale.',
        ],
      },
      en: {
        title: 'A report you put together in Basic, and dynamic loads in PRO',
        items: [
          'Zoom from kilometers down to millimeters, picking members that overlap, hiding parts of the model, and easier-to-read labels.',
          'You build the PDF calculation report by choosing what goes in, including the kinematic analysis and the balanced free-body diagrams, and figures export ready to print.',
          'A video of the structure going up floor by floor.',
          'Composite and reference load cases, notional loads, and SRSS and ABS combinations.',
          'Dynamic and moving loads: project-specific response spectra and catalog vehicles.',
          'Units across PRO, and exports to Excel, CSV, PDF report, DXF and images, each with a dialog that shows what comes out.',
        ],
      },
      pt: {
        title: 'Relatório sob medida no Básico e cargas dinâmicas no PRO',
        items: [
          'Zoom de quilômetros a milímetros, seleção de barras sobrepostas, ocultar partes do modelo e rótulos mais legíveis.',
          'O relatório de cálculo em PDF é montado escolhendo o que incluir, entre outras coisas a análise cinemática e os diagramas de corpo livre em equilíbrio, e as figuras saem prontas para imprimir.',
          'Um vídeo que mostra a estrutura sendo construída andar por andar.',
          'Casos de carga compostos e de referência, cargas nocionais e combinações por SRSS e ABS.',
          'Cargas dinâmicas e móveis: espectros de resposta próprios do projeto e veículos de catálogo.',
          'Unidades em todo o PRO e exportações para Excel, CSV, relatório PDF, DXF e imagens, cada uma com um diálogo que mostra o que sai.',
        ],
      },
      de: {
        title: 'Eine statische Berechnung nach Maß in Basis und dynamische Lasten in PRO',
        items: [
          'Zoom von Kilometern bis zu Millimetern, Auswahl überlappender Stäbe, Ausblenden von Modellteilen und besser lesbare Beschriftungen.',
          'Die statische Berechnung als PDF wird zusammengestellt, indem man auswählt, was hineinkommt, unter anderem die kinematische Analyse und die Freikörperbilder im Gleichgewicht, und die Abbildungen werden druckfertig exportiert.',
          'Ein Video, das zeigt, wie das Tragwerk Geschoss für Geschoss entsteht.',
          'Zusammengesetzte Lastfälle und Referenzlastfälle, Ersatzlasten und Kombinationen nach SRSS und ABS.',
          'Dynamische und bewegliche Lasten: projekteigene Antwortspektren und Fahrzeuge aus dem Katalog.',
          'Einheiten im gesamten PRO und Exporte nach Excel, CSV, PDF-Bericht, DXF und als Bilder, jeweils mit einem Dialog, der zeigt, was ausgegeben wird.',
        ],
      },
      fr: {
        title: 'Une note de calcul sur mesure dans Basique, et des charges dynamiques dans PRO',
        items: [
          'Zoom du kilomètre au millimètre, sélection de barres superposées, masquage de parties du modèle et étiquettes plus lisibles.',
          'La note de calcul en PDF se compose en choisissant ce qu\'elle contient, entre autres l\'analyse cinématique et les corps libres en équilibre, et les figures s\'exportent prêtes à imprimer.',
          'Une vidéo qui montre la structure s\'élever étage par étage.',
          'Cas de charge composés et de référence, charges notionnelles et combinaisons SRSS et ABS.',
          'Charges dynamiques et mobiles : spectres de réponse propres au projet et véhicules de catalogue.',
          'Unités dans tout PRO et exports vers Excel, CSV, note de calcul PDF, DXF et images, chacun avec une boîte de dialogue qui montre ce qui sera produit.',
        ],
      },
      tr: {
        title: 'Temel\'de isteğe göre hazırlanan rapor ve PRO\'da dinamik yükler',
        items: [
          'Kilometreden milimetreye yakınlaştırma, üst üste binen çubukların seçimi, modelin bölümlerini gizleme ve daha okunaklı etiketler.',
          'PDF hesap raporu, içine ne gireceği seçilerek hazırlanıyor; bunlar arasında kinematik analiz ve dengedeki serbest cisim diyagramları da var. Şekiller yazdırmaya hazır olarak dışa aktarılıyor.',
          'Yapının kat kat yükselişini gösteren bir video.',
          'Bileşik ve referans yük durumları, fiktif yükler ve SRSS ile ABS kombinasyonları.',
          'Dinamik ve hareketli yükler: projeye özgü tepki spektrumları ve katalogdan araçlar.',
          'PRO\'nun tamamında birimler ve Excel, CSV, PDF rapor, DXF ve görüntü olarak dışa aktarma; her biri neyin çıkacağını gösteren bir iletişim kutusuyla.',
        ],
      },
    },
  },
  {
    date: '2026-10-09',
    areas: ['pro', 'pro', 'pro', 'pro'],
    i18n: {
      es: {
        title: 'Cargas según reglamento en el PRO',
        items: [
          'El generador de cargas según reglamento cubre techos, acumulación de nieve y cargas alternadas, y calcula el factor de ráfaga del viento según el CIRSOC 102.',
          'Las cargas sobre barras, nodos y placas se escriben a mano con su dirección, su variación y la zona que cubren.',
          'Unidades de visualización, barras de sección variable y mejoras al editor de secciones.',
          'El diseño de hormigón armado de un edificio entero tarda menos de la mitad que antes.',
        ],
      },
      en: {
        title: 'Code-based loads in PRO',
        items: [
          'The code load generator covers roofs, snow drifts and pattern loading, and computes the wind gust factor per CIRSOC 102.',
          'Loads on members, nodes and plates can be typed in with their direction, their variation and the area they cover.',
          'Display units, tapered members and improvements to the section editor.',
          'Reinforced concrete design of a whole building takes less than half the time it used to.',
        ],
      },
      pt: {
        title: 'Cargas conforme a norma no PRO',
        items: [
          'O gerador de cargas conforme a norma cobre telhados, acúmulo de neve e cargas alternadas, e calcula o fator de rajada do vento segundo a CIRSOC 102.',
          'As cargas em barras, nós e placas podem ser digitadas com sua direção, sua variação e a região que cobrem.',
          'Unidades de visualização, barras de seção variável e melhorias no editor de seções.',
          'O dimensionamento de concreto armado de um edifício inteiro leva menos da metade do tempo de antes.',
        ],
      },
      de: {
        title: 'Lasten nach Norm in PRO',
        items: [
          'Der Lastgenerator nach Norm deckt Dächer, Schneeverwehungen und feldweise Lastanordnung ab und berechnet den Böenfaktor des Winds nach CIRSOC 102.',
          'Lasten auf Stäben, Knoten und Platten lassen sich mit Richtung, Verlauf und belasteter Fläche von Hand eingeben.',
          'Anzeigeeinheiten, gevoutete Stäbe und Verbesserungen am Querschnittseditor.',
          'Die Stahlbetonbemessung eines ganzen Gebäudes dauert weniger als halb so lange wie zuvor.',
        ],
      },
      fr: {
        title: 'Charges réglementaires dans PRO',
        items: [
          'Le générateur de charges réglementaires couvre les toitures, les accumulations de neige et les charges en damier, et calcule le facteur de rafale du vent selon le CIRSOC 102.',
          'Les charges sur les barres, les nœuds et les plaques se saisissent à la main avec leur direction, leur variation et la zone qu\'elles couvrent.',
          'Unités d\'affichage, barres à inertie variable et améliorations de l\'éditeur de sections.',
          'Le dimensionnement en béton armé d\'un bâtiment entier prend moins de la moitié du temps qu\'auparavant.',
        ],
      },
      tr: {
        title: 'PRO\'da yönetmeliğe göre yükler',
        items: [
          'Yönetmeliğe göre yük oluşturucu çatıları, kar birikmesini ve dama tahtası yüklemesini kapsıyor ve rüzgârın hamle faktörünü CIRSOC 102\'ye göre hesaplıyor.',
          'Çubuklara, düğümlere ve plaklara gelen yükler doğrultuları, değişimleri ve kapladıkları alanla elle girilebiliyor.',
          'Görüntüleme birimleri, değişken kesitli çubuklar ve kesit düzenleyicide iyileştirmeler.',
          'Bütün bir binanın betonarme boyutlandırması eskisinin yarısından daha kısa sürüyor.',
        ],
      },
    },
  },
  {
    date: '2026-10-02',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-building-model',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Un edificio de varios pisos modelado en el modo PRO, con grillas y niveles',
        en: 'A multi-story building modeled in PRO mode, with grids and levels',
        pt: 'Um edifício de vários andares modelado no modo PRO, com eixos e níveis',
        de: 'Ein mehrgeschossiges Gebäude, im PRO-Modus mit Raster und Geschossen modelliert',
        fr: 'Un bâtiment de plusieurs étages modélisé dans le mode PRO, avec grilles et niveaux',
        tr: 'PRO modunda aks ızgaraları ve katlarla modellenmiş çok katlı bir bina',
      },
    },
    i18n: {
      es: {
        title: 'Del ejercicio al proyecto real en el PRO',
        items: [
          'Las barras se dibujan punto a punto, con referencias a nodos, puntos medios y cruces, y la app pregunta si conectar lo que se cruza.',
          'Un paso a paso explicado que cubre quince métodos de cálculo.',
          'El análisis dinámico dibuja los modos de vibración.',
          'Grillas y niveles, generadores de estructuras que se insertan en el modelo, y copiar y pegar.',
          'Cargas de piso por área tributaria, mallado de placas, apoyos elásticos y fundaciones.',
          'Tablas de resultados, límites de flecha, contornos en placas, un libro Excel del proyecto e informe.',
          'Un editor para dibujar secciones compuestas y la búsqueda del perfil más liviano que verifica.',
          'Siete estructuras de referencia publicadas, modeladas para contrastar los resultados, y una galería de 24 ejemplos.',
          'Un resolvedor que acelera mucho los modelos grandes y una corrección de los elementos de placa.',
        ],
      },
      en: {
        title: 'From exercises to real projects in PRO',
        items: [
          'Members are drawn point to point, snapping to nodes, midpoints and crossings, and the app asks whether to connect what crosses.',
          'Explained step-by-step solutions covering fifteen analysis methods.',
          'Dynamic analysis draws the mode shapes.',
          'Grids and levels, structure generators that insert into the model, and copy and paste.',
          'Floor loads by tributary area, plate meshing, elastic supports and foundations.',
          'Result tables, deflection limits, plate contours, a project Excel workbook and a report.',
          'An editor to draw built-up sections, and a search for the lightest section that passes.',
          'Seven published reference structures, modeled to check the results against, and a gallery of 24 examples.',
          'A solver that makes large models much faster, and a fix to the plate elements.',
        ],
      },
      pt: {
        title: 'Do exercício ao projeto real no PRO',
        items: [
          'As barras são desenhadas ponto a ponto, com referências a nós, pontos médios e cruzamentos, e o app pergunta se deve conectar o que se cruza.',
          'Um passo a passo explicado que cobre quinze métodos de cálculo.',
          'A análise dinâmica desenha os modos de vibração.',
          'Eixos e níveis, geradores de estruturas que se inserem no modelo, e copiar e colar.',
          'Cargas de piso por área de influência, malha de placas, apoios elásticos e fundações.',
          'Tabelas de resultados, limites de flecha, contornos em placas, uma pasta Excel do projeto e relatório.',
          'Um editor para desenhar seções compostas e a busca do perfil mais leve que verifica.',
          'Sete estruturas de referência publicadas, modeladas para comparar os resultados, e uma galeria de 24 exemplos.',
          'Um solucionador que acelera muito os modelos grandes e uma correção dos elementos de placa.',
        ],
      },
      de: {
        title: 'Von der Übung zum echten Projekt in PRO',
        items: [
          'Stäbe werden von Punkt zu Punkt gezeichnet, mit Fang an Knoten, Mittelpunkten und Schnittpunkten, und die App fragt, ob sich Kreuzendes verbinden soll.',
          'Erklärte Schritt-für-Schritt-Lösungen für fünfzehn Berechnungsverfahren.',
          'Die dynamische Analyse zeichnet die Eigenformen.',
          'Raster und Geschosse, Tragwerksgeneratoren, die in das Modell einfügen, sowie Kopieren und Einfügen.',
          'Deckenlasten über Einzugsflächen, Vernetzung von Platten, elastische Auflager und Gründungen.',
          'Ergebnistabellen, Durchbiegungsgrenzen, Isoliniendarstellungen auf Platten, eine Excel-Arbeitsmappe des Projekts und ein Bericht.',
          'Ein Editor zum Zeichnen zusammengesetzter Querschnitte und die Suche nach dem leichtesten Profil, das den Nachweis erfüllt.',
          'Sieben veröffentlichte Referenztragwerke, modelliert, um die Ergebnisse daran zu prüfen, und eine Galerie mit 24 Beispielen.',
          'Ein Gleichungslöser, der große Modelle deutlich beschleunigt, und eine Korrektur der Plattenelemente.',
        ],
      },
      fr: {
        title: 'De l\'exercice au vrai projet dans PRO',
        items: [
          'Les barres se dessinent de point à point, avec accrochage aux nœuds, aux milieux et aux intersections, et l\'application demande s\'il faut relier ce qui se croise.',
          'Des solutions pas à pas commentées couvrant quinze méthodes de calcul.',
          'L\'analyse dynamique dessine les modes propres.',
          'Grilles et niveaux, générateurs de structures qui s\'insèrent dans le modèle, et copier-coller.',
          'Charges de plancher par aire d\'influence, maillage des plaques, appuis élastiques et fondations.',
          'Tableaux de résultats, limites de flèche, isovaleurs sur les plaques, un classeur Excel du projet et une note de calcul.',
          'Un éditeur pour dessiner des sections composées, et la recherche du profilé le plus léger qui est conforme.',
          'Sept structures de référence publiées, modélisées pour confronter les résultats, et une galerie de 24 exemples.',
          'Un solveur qui accélère nettement les grands modèles, et une correction des éléments de plaque.',
        ],
      },
      tr: {
        title: 'PRO\'da alıştırmadan gerçek projeye',
        items: [
          'Çubuklar noktadan noktaya çiziliyor; düğümlere, orta noktalara ve kesişimlere yakalama var ve uygulama kesişen elemanların birleştirilip birleştirilmeyeceğini soruyor.',
          'On beş hesap yöntemini kapsayan açıklamalı adım adım çözümler.',
          'Dinamik analiz mod şekillerini çiziyor.',
          'Aks ızgaraları ve katlar, modele eklenen yapı oluşturucular ve kopyala yapıştır.',
          'Etki alanına göre döşeme yükleri, plaklarda ağ oluşturma, elastik mesnetler ve temeller.',
          'Sonuç tabloları, sehim sınırları, plaklarda kontur çizimleri, projenin Excel çalışma kitabı ve bir rapor.',
          'Yapma kesitleri çizmek için bir düzenleyici ve kontrolleri sağlayan en hafif profilin aranması.',
          'Sonuçları karşılaştırmak için modellenmiş, yayımlanmış yedi referans yapı ve 24 örneklik bir galeri.',
          'Büyük modelleri belirgin biçimde hızlandıran bir çözücü ve plak elemanlarında bir düzeltme.',
        ],
      },
    },
  },
  {
    date: '2026-09-25',
    areas: ['site', 'site', 'basic', 'basic', 'basic', 'edu', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-rebar-3d',
      w: 1600,
      h: 834,
      alt: {
        es: 'Las armaduras diseñadas de una estructura de hormigón armado, vistas en 3D en el modo PRO',
        en: 'The designed reinforcement of a reinforced concrete structure, shown in 3D in PRO mode',
        pt: 'As armaduras dimensionadas de uma estrutura de concreto armado, vistas em 3D no modo PRO',
        de: 'Die bemessene Bewehrung eines Stahlbetontragwerks, im PRO-Modus in 3D dargestellt',
        fr: 'Les armatures dimensionnées d\'une structure en béton armé, vues en 3D dans le mode PRO',
        tr: 'Betonarme bir yapının boyutlandırılmış donatıları, PRO modunda 3B olarak',
      },
    },
    i18n: {
      es: {
        title: 'Diseño de hormigón armado en el PRO',
        items: [
          'Una landing más corta, con la propuesta de precios y un panel de contacto que también aparece dentro de la app.',
          'Una nota nueva en el blog sobre cuándo modelar con barras y cuándo con elementos finitos, y una guía de usuario.',
          'La calculadora de hormigón armado según el CIRSOC Flex ahora propone las barras, y quedó contrastada con la planilla original.',
          'Paso a paso por los métodos de rigidez y de flexibilidades, en 2D y 3D.',
          'Cargas de temperatura en todos los análisis.',
          'El modo Educativo pasó a ser un panel dentro del Básico.',
          'Diseño de hormigón armado y una interfaz del PRO reorganizada.',
          'Control de equilibrio del modelo y análisis dinámicos: modal, espectral e historia en el tiempo.',
          'Un modelo mal armado se rechaza con un mensaje en lugar de devolver ceros.',
        ],
      },
      en: {
        title: 'Reinforced concrete design in PRO',
        items: [
          'A shorter landing page, with the pricing proposal and a contact panel that also shows inside the app.',
          'A new blog post on when to model with members and when with finite elements, and a user guide.',
          'The CIRSOC Flex reinforced concrete calculator now proposes the bars, and was checked against the original spreadsheet.',
          'Step-by-step solutions by the stiffness and flexibility methods, in 2D and 3D.',
          'Temperature loads in every analysis.',
          'Education mode became a panel inside Basic.',
          'Reinforced concrete design, and a reorganized PRO interface.',
          'A model equilibrium check, and dynamic analyses: modal, response spectrum and time history.',
          'A badly built model is now rejected with a message instead of returning zeros.',
        ],
      },
      pt: {
        title: 'Dimensionamento de concreto armado no PRO',
        items: [
          'Uma landing mais curta, com a proposta de preços e um painel de contato que também aparece dentro do app.',
          'Um artigo novo no blog sobre quando modelar com barras e quando com elementos finitos, e um guia do usuário.',
          'A calculadora de concreto armado segundo o CIRSOC Flex agora propõe as barras e foi comparada com a planilha original.',
          'Passo a passo pelos métodos da rigidez e das flexibilidades, em 2D e 3D.',
          'Cargas de temperatura em todas as análises.',
          'O modo Educativo virou um painel dentro do Básico.',
          'Dimensionamento de concreto armado e uma interface do PRO reorganizada.',
          'Verificação de equilíbrio do modelo e análises dinâmicas: modal, espectral e histórico no tempo.',
          'Um modelo mal montado agora é rejeitado com uma mensagem em vez de devolver zeros.',
        ],
      },
      de: {
        title: 'Stahlbetonbemessung in PRO',
        items: [
          'Eine kürzere Startseite mit dem Preisvorschlag und einem Kontaktbereich, der auch in der App erscheint.',
          'Ein neuer Blogbeitrag dazu, wann man mit Stäben und wann mit finiten Elementen modelliert, und ein Benutzerhandbuch.',
          'Der Stahlbetonrechner nach CIRSOC Flex schlägt jetzt die Bewehrungsstäbe vor und wurde mit der ursprünglichen Tabellenkalkulation abgeglichen.',
          'Schritt-für-Schritt-Lösungen nach dem Weggrößen- und dem Kraftgrößenverfahren, in 2D und 3D.',
          'Temperaturlasten in allen Berechnungen.',
          'Der Lehrmodus wurde zu einem Bereich innerhalb von Basis.',
          'Stahlbetonbemessung und eine neu geordnete PRO-Oberfläche.',
          'Eine Gleichgewichtskontrolle des Modells und dynamische Analysen: modal, mit Antwortspektrum und im Zeitverlauf.',
          'Ein fehlerhaft aufgebautes Modell wird jetzt mit einer Meldung abgewiesen, statt Nullen zu liefern.',
        ],
      },
      fr: {
        title: 'Le dimensionnement du béton armé dans PRO',
        items: [
          'Une page d\'accueil plus courte, avec la proposition tarifaire et un panneau de contact qui apparaît aussi dans l\'application.',
          'Un nouvel article de blog sur le moment de modéliser avec des barres ou avec des éléments finis, et un guide d\'utilisation.',
          'La calculatrice de béton armé selon CIRSOC Flex propose désormais les barres, et a été confrontée au tableur d\'origine.',
          'Des solutions pas à pas par la méthode des déplacements et par la méthode des forces, en 2D et en 3D.',
          'Charges thermiques dans tous les calculs.',
          'Le mode Enseignement est devenu un panneau à l\'intérieur de Basique.',
          'Le dimensionnement du béton armé et une interface PRO réorganisée.',
          'Un contrôle de l\'équilibre du modèle et des analyses dynamiques : modale, spectrale et temporelle.',
          'Un modèle mal construit est désormais refusé avec un message au lieu de renvoyer des zéros.',
        ],
      },
      tr: {
        title: 'PRO\'da betonarme boyutlandırma',
        items: [
          'Fiyat önerisini ve uygulamanın içinde de görünen bir iletişim panelini içeren daha kısa bir açılış sayfası.',
          'Blogda ne zaman çubuklarla, ne zaman sonlu elemanlarla modellemek gerektiğine dair yeni bir yazı ve bir kullanım kılavuzu.',
          'CIRSOC Flex\'e göre betonarme hesap aracı artık donatı çubuklarını öneriyor ve özgün hesap tablosuyla karşılaştırıldı.',
          'Rijitlik ve esneklik yöntemleriyle adım adım çözümler, 2B ve 3B\'de.',
          'Tüm analizlerde sıcaklık yükleri.',
          'Eğitim modu, Temel\'in içinde bir panel oldu.',
          'Betonarme boyutlandırma ve yeniden düzenlenmiş bir PRO arayüzü.',
          'Model denge kontrolü ve dinamik analizler: modal, tepki spektrumu ve zaman tanım alanında.',
          'Hatalı kurulmuş bir model artık sıfır döndürmek yerine bir iletiyle reddediliyor.',
        ],
      },
    },
  },
  {
    date: '2026-09-11',
    areas: ['app', 'basic', 'basic', 'pro'],
    shot: {
      base: 'changelog-mobile',
      w: 1600,
      h: 3464,
      alt: {
        es: 'El modo Básico en un celular, con el diagrama de momentos de un pórtico',
        en: 'Basic mode on a phone, with the bending moment diagram of a frame',
        pt: 'O modo Básico em um celular, com o diagrama de momentos de um pórtico',
        de: 'Der Basis-Modus auf einem Smartphone, mit der Momentenlinie eines Rahmens',
        fr: 'Le mode Basique sur un téléphone, avec le diagramme des moments d\'un portique',
        tr: 'Telefonda Temel modu; bir çerçevenin eğilme momenti diyagramıyla',
      },
    },
    i18n: {
      es: {
        title: 'Stabileo en el celular',
        items: [
          'Una interfaz para el celular, con el mismo marco para el Básico y el PRO.',
          'Importación de modelos desde Excel, y los links compartidos vuelven a abrir el modelo completo.',
          'Dimensionado de armaduras de secciones según el CIRSOC Flex, la planilla que usan casi todos los ingenieros civiles.',
          'Estructuras metálicas: selectores de secciones y materiales, generadores, el flujo de trabajo en acero y el diseño de uniones.',
        ],
      },
      en: {
        title: 'Stabileo on your phone',
        items: [
          'A phone interface, with the same layout for Basic and PRO.',
          'Model import from Excel, and shared links open the full model again.',
          'Reinforcement design of sections per CIRSOC Flex, the spreadsheet most civil engineers in Argentina use.',
          'Steel structures: section and material pickers, generators, the steel workflow and connection design.',
        ],
      },
      pt: {
        title: 'Stabileo no celular',
        items: [
          'Uma interface para celular, com a mesma estrutura para o Básico e o PRO.',
          'Importação de modelos a partir do Excel, e os links compartilhados voltam a abrir o modelo completo.',
          'Dimensionamento de armaduras de seções segundo o CIRSOC Flex, a planilha que quase todos os engenheiros civis argentinos usam.',
          'Estruturas metálicas: seletores de seções e materiais, geradores, o fluxo de trabalho em aço e o dimensionamento de ligações.',
        ],
      },
      de: {
        title: 'Stabileo auf dem Smartphone',
        items: [
          'Eine Oberfläche für das Smartphone, mit demselben Aufbau für Basis und PRO.',
          'Import von Modellen aus Excel, und geteilte Links öffnen wieder das vollständige Modell.',
          'Bewehrungsbemessung von Querschnitten nach CIRSOC Flex, der Tabellenkalkulation, die die meisten Bauingenieure in Argentinien verwenden.',
          'Stahltragwerke: Auswahl von Querschnitten und Werkstoffen, Generatoren, der Arbeitsablauf im Stahlbau und die Bemessung von Anschlüssen.',
        ],
      },
      fr: {
        title: 'Stabileo sur votre téléphone',
        items: [
          'Une interface pour téléphone, avec la même disposition pour Basique et PRO.',
          'Import de modèles depuis Excel, et les liens partagés rouvrent le modèle complet.',
          'Dimensionnement des armatures de sections selon CIRSOC Flex, le tableur qu\'utilisent la plupart des ingénieurs civils en Argentine.',
          'Structures métalliques : sélection des sections et des matériaux, générateurs, le flux de travail acier et le dimensionnement des assemblages.',
        ],
      },
      tr: {
        title: 'Stabileo telefonunuzda',
        items: [
          'Temel ve PRO için aynı düzene sahip bir telefon arayüzü.',
          'Excel\'den model içe aktarma; paylaşılan bağlantılar da yeniden tam modeli açıyor.',
          'Arjantin\'deki inşaat mühendislerinin çoğunun kullandığı hesap tablosu CIRSOC Flex\'e göre kesitlerin donatı boyutlandırması.',
          'Çelik yapılar: kesit ve malzeme seçicileri, oluşturucular, çelik iş akışı ve birleşim boyutlandırması.',
        ],
      },
    },
  },
  {
    date: '2026-08-28',
    areas: ['pro', 'site', 'basic', 'engine'],
    shot: {
      base: '3d-industrial',
      w: 1600,
      h: 876,
      alt: {
        es: 'Una nave industrial metálica generada con parámetros editables',
        en: 'A steel industrial shed built from editable parameters',
        pt: 'Um galpão industrial metálico gerado com parâmetros editáveis',
        de: 'Eine Industriehalle aus Stahl, aus bearbeitbaren Parametern erzeugt',
        fr: 'Une halle industrielle métallique générée à partir de paramètres modifiables',
        tr: 'Düzenlenebilir parametrelerle oluşturulmuş çelik bir endüstriyel yapı',
      },
    },
    i18n: {
      es: {
        title: 'Estructuras metálicas y sitio en tres idiomas',
        items: [
          'Generadores de cabriadas, columnas reticuladas y naves industriales a partir de parámetros editables, con un selector de perfiles con catálogo y filtros.',
          'La landing y el blog en español, inglés y portugués. El sitio pasó a ser indexable por los buscadores, con dieciocho páginas y cuatro notas.',
          'Siete tutoriales cortos, que reemplazan al recorrido guiado.',
          'Tres errores de cálculo corregidos: el corte de un tubo circular, el corte pico y un análisis por etapas que descartaba losas y tabiques.',
        ],
      },
      en: {
        title: 'Steel structures, and the site in three languages',
        items: [
          'Generators for trusses, lattice columns and industrial sheds from editable parameters, with a section picker that has a catalog and filters.',
          'The landing page and the blog in Spanish, English and Portuguese. The site became indexable by search engines, with eighteen pages and four posts.',
          'Seven short tutorials, replacing the guided tour.',
          'Three calculation errors fixed: the shear of a circular tube, peak shear, and a staged analysis that dropped slabs and walls.',
        ],
      },
      pt: {
        title: 'Estruturas metálicas e site em três idiomas',
        items: [
          'Geradores de treliças de cobertura, pilares treliçados e galpões industriais a partir de parâmetros editáveis, com um seletor de perfis com catálogo e filtros.',
          'A landing e o blog em espanhol, inglês e português. O site passou a ser indexável pelos buscadores, com dezoito páginas e quatro artigos.',
          'Sete tutoriais curtos, que substituem o tour guiado.',
          'Três erros de cálculo corrigidos: o cortante de um tubo circular, o cortante de pico e uma análise por etapas que descartava lajes e paredes.',
        ],
      },
      de: {
        title: 'Stahltragwerke und die Website in drei Sprachen',
        items: [
          'Generatoren für Fachwerke, Gitterstützen und Industriehallen aus bearbeitbaren Parametern, mit einer Profilauswahl samt Katalog und Filtern.',
          'Die Startseite und der Blog auf Spanisch, Englisch und Portugiesisch. Die Website wurde für Suchmaschinen indexierbar, mit achtzehn Seiten und vier Beiträgen.',
          'Sieben kurze Anleitungen, die die geführte Tour ersetzen.',
          'Drei Rechenfehler behoben: die Querkraft eines Kreisrohrs, die Spitzenquerkraft und eine Berechnung in Bauphasen, die Decken und Wände wegließ.',
        ],
      },
      fr: {
        title: 'Les structures métalliques, et le site en trois langues',
        items: [
          'Générateurs de fermes, de poteaux en treillis et de halles industrielles à partir de paramètres modifiables, avec un sélecteur de profilés doté d\'un catalogue et de filtres.',
          'La page d\'accueil et le blog en espagnol, en anglais et en portugais. Le site est devenu indexable par les moteurs de recherche, avec dix-huit pages et quatre articles.',
          'Sept tutoriels courts, qui remplacent la visite guidée.',
          'Trois erreurs de calcul corrigées : l\'effort tranchant d\'un tube circulaire, l\'effort tranchant de pointe et une analyse par phases qui omettait des dalles et des voiles.',
        ],
      },
      tr: {
        title: 'Çelik yapılar ve üç dilde site',
        items: [
          'Düzenlenebilir parametrelerden kafes kirişler, kafes kolonlar ve endüstriyel yapılar için oluşturucular; katalog ve filtreler içeren bir profil seçiciyle.',
          'Açılış sayfası ve blog İspanyolca, İngilizce ve Portekizce. Site, on sekiz sayfa ve dört yazıyla arama motorlarında dizine eklenebilir hâle geldi.',
          'Rehberli turun yerini alan yedi kısa öğretici.',
          'Üç hesap hatası düzeltildi: dairesel bir borunun kesme kuvveti, tepe kesme kuvveti ve döşemeleri ve perde duvarları atlayan aşamalı bir analiz.',
        ],
      },
    },
  },
  {
    date: '2026-08-21',
    areas: ['basic', 'basic', 'basic', 'pro'],
    shot: {
      base: '2d-section-analysis',
      w: 1600,
      h: 997,
      alt: {
        es: 'El análisis de sección del modo Básico, con el estado tensional sobre el contorno real del perfil',
        en: 'Basic mode section analysis, with the stress state over the real outline of the section',
        pt: 'A análise de seção do modo Básico, com o estado de tensões sobre o contorno real do perfil',
        de: 'Die Querschnittsanalyse im Basis-Modus, mit dem Spannungszustand über dem tatsächlichen Umriss des Profils',
        fr: 'L\'analyse de section du mode Basique, avec l\'état de contrainte sur le contour réel du profilé',
        tr: 'Temel modunda kesit analizi; profilin gerçek konturu üzerindeki gerilme durumuyla',
      },
    },
    i18n: {
      es: {
        title: 'Análisis de sección y nueva interfaz del PRO',
        items: [
          'Haciendo clic en cualquier punto de la estructura se obtiene el estado tensional sobre la sección real, con tensiones principales, círculo de Mohr, núcleo central y un punto de carga que se arrastra para ver el efecto de la excentricidad.',
          'Una base de materiales y perfiles de Argentina, Europa, Estados Unidos y Brasil, con más de 700 perfiles revisados contra sus normas.',
          'Herramientas de selección y movimiento más cómodas, y mapas de tensiones con escala de colores.',
          'El PRO se rediseñó con la misma identidad visual que el Básico.',
        ],
      },
      en: {
        title: 'Section analysis, and a new PRO interface',
        items: [
          'Clicking any point of the structure gives the stress state over the actual section, with principal stresses, Mohr\'s circle, the section kern, and a load point you drag to see the effect of eccentricity.',
          'A materials and sections database for Argentina, Europe, the United States and Brazil, with more than 700 sections checked against their standards.',
          'Easier selection and move tools, and stress maps with a color scale.',
          'PRO was redesigned with the same visual identity as Basic.',
        ],
      },
      pt: {
        title: 'Análise de seção e nova interface do PRO',
        items: [
          'Clicando em qualquer ponto da estrutura se obtém o estado de tensões sobre a seção real, com tensões principais, círculo de Mohr, núcleo central e um ponto de carga que se arrasta para ver o efeito da excentricidade.',
          'Uma base de materiais e perfis da Argentina, Europa, Estados Unidos e Brasil, com mais de 700 perfis conferidos com suas normas.',
          'Ferramentas de seleção e movimento mais práticas, e mapas de tensões com escala de cores.',
          'O PRO foi redesenhado com a mesma identidade visual do Básico.',
        ],
      },
      de: {
        title: 'Querschnittsanalyse und eine neue PRO-Oberfläche',
        items: [
          'Ein Klick auf einen beliebigen Punkt des Tragwerks liefert den Spannungszustand über dem tatsächlichen Querschnitt, mit Hauptspannungen, Mohr-Spannungskreis, Querschnittskern und einem Lastpunkt, den man verschiebt, um die Wirkung der Exzentrizität zu sehen.',
          'Eine Werkstoff- und Profildatenbank für Argentinien, Europa, die Vereinigten Staaten und Brasilien, mit mehr als 700 anhand ihrer Normen geprüften Profilen.',
          'Komfortablere Werkzeuge zum Auswählen und Verschieben und Spannungsbilder mit Farbskala.',
          'PRO wurde mit derselben visuellen Identität wie Basis neu gestaltet.',
        ],
      },
      fr: {
        title: 'L\'analyse de section, et une nouvelle interface PRO',
        items: [
          'Un clic sur n\'importe quel point de la structure donne l\'état de contrainte sur la section réelle, avec les contraintes principales, le cercle de Mohr, le noyau central et un point de charge que l\'on fait glisser pour voir l\'effet de l\'excentricité.',
          'Une base de matériaux et de profilés pour l\'Argentine, l\'Europe, les États-Unis et le Brésil, avec plus de 700 profilés vérifiés par rapport à leurs normes.',
          'Des outils de sélection et de déplacement plus pratiques, et des cartes de contraintes avec une échelle de couleurs.',
          'PRO a été redessiné avec la même identité visuelle que Basique.',
        ],
      },
      tr: {
        title: 'Kesit analizi ve yeni PRO arayüzü',
        items: [
          'Yapının herhangi bir noktasına tıklamak gerçek kesit üzerindeki gerilme durumunu veriyor: asal gerilmeler, Mohr dairesi, kesit çekirdeği ve dışmerkezliğin etkisini görmek için sürüklenen bir yük noktası.',
          'Arjantin, Avrupa, ABD ve Brezilya için bir malzeme ve profil veritabanı; standartlarına göre kontrol edilmiş 700\'den fazla profille.',
          'Daha rahat seçme ve taşıma araçları ve renk ölçekli gerilme haritaları.',
          'PRO, Temel ile aynı görsel kimlikle yeniden tasarlandı.',
        ],
      },
    },
  },
  {
    date: '2026-08-14',
    areas: ['basic', 'basic', 'edu', 'pro', 'engine'],
    shot: {
      base: 'edu-exercise',
      w: 1600,
      h: 769,
      alt: {
        es: 'Un ejercicio del modo Educativo, con los diagramas que traza el alumno corregidos contra el cálculo',
        en: 'An Education mode exercise, with the diagrams the student draws graded against the analysis',
        pt: 'Um exercício do modo Educativo, com os diagramas traçados pelo aluno corrigidos contra o cálculo',
        de: 'Eine Übung im Lehrmodus, bei der die von den Studierenden gezeichneten Verläufe mit der Berechnung abgeglichen und bewertet werden',
        fr: 'Un exercice du mode Enseignement, avec les diagrammes tracés par l\'étudiant corrigés par rapport au calcul',
        tr: 'Eğitim modunda bir alıştırma; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor',
      },
    },
    i18n: {
      es: {
        title: 'Identidad visual nueva y modo Educativo',
        items: [
          'Toda la interfaz del Básico con la identidad visual de la landing nueva.',
          'Cada perfil se resuelve a su contorno exacto. Si no lo tiene, la app no calcula tensiones en lugar de inventar los espesores que faltan.',
          'El docente arma el ejercicio dentro de la app y el alumno lo resuelve; los diagramas que traza se corrigen contra el cálculo.',
          'Fundaciones de hormigón armado: del diseño de la armadura a un archivo de CAD, con el despiece en 3D.',
          'Correcciones en las verificaciones de diseño: valores por defecto del lado inseguro, estados límite que faltaban y datos que se ignoraban.',
        ],
      },
      en: {
        title: 'A new visual identity, and Education mode',
        items: [
          'The whole Basic interface with the visual identity of the new landing page.',
          'Every section resolves to its exact outline. When it has none, the app declines to compute stresses instead of inventing the missing thicknesses.',
          'The teacher builds the exercise inside the app and the student solves it; the diagrams the student draws are graded against the analysis.',
          'Reinforced concrete footings: from reinforcement design to a CAD file, with the bar schedule in 3D.',
          'Fixes to the design checks: unconservative defaults, missing limit states and inputs that were being ignored.',
        ],
      },
      pt: {
        title: 'Identidade visual nova e modo Educativo',
        items: [
          'Toda a interface do Básico com a identidade visual da nova landing.',
          'Cada perfil é resolvido no seu contorno exato. Se não tiver um, o app não calcula tensões em vez de inventar as espessuras que faltam.',
          'O professor monta o exercício dentro do app e o aluno o resolve; os diagramas que ele traça são corrigidos contra o cálculo.',
          'Fundações de concreto armado: do dimensionamento da armadura a um arquivo de CAD, com o detalhamento em 3D.',
          'Correções nas verificações de dimensionamento: valores padrão contra a segurança, estados limites que faltavam e dados que eram ignorados.',
        ],
      },
      de: {
        title: 'Eine neue visuelle Identität und der Lehrmodus',
        items: [
          'Die gesamte Oberfläche von Basis in der visuellen Identität der neuen Startseite.',
          'Jedes Profil wird auf seinen genauen Umriss zurückgeführt. Fehlt dieser, berechnet die App keine Spannungen, statt die fehlenden Dicken zu erfinden.',
          'Die Lehrkraft erstellt die Übung in der App und die Studierenden lösen sie; die von ihnen gezeichneten Verläufe werden mit der Berechnung abgeglichen und bewertet.',
          'Stahlbetonfundamente: von der Bewehrungsbemessung bis zu einer CAD-Datei, mit der Biegeliste in 3D.',
          'Korrekturen an den Nachweisen: Standardwerte auf der unsicheren Seite, fehlende Grenzzustände und Eingaben, die ignoriert wurden.',
        ],
      },
      fr: {
        title: 'Une nouvelle identité visuelle, et le mode Enseignement',
        items: [
          'Toute l\'interface de Basique avec l\'identité visuelle de la nouvelle page d\'accueil.',
          'Chaque profilé est ramené à son contour exact. S\'il n\'en a pas, l\'application ne calcule pas de contraintes plutôt que d\'inventer les épaisseurs manquantes.',
          'L\'enseignant construit l\'exercice dans l\'application et l\'étudiant le résout ; les diagrammes qu\'il trace sont corrigés par rapport au calcul.',
          'Semelles en béton armé : du dimensionnement des armatures jusqu\'à un fichier CAO, avec la nomenclature des armatures en 3D.',
          'Corrections des vérifications : valeurs par défaut du côté de l\'insécurité, états limites manquants et données qui étaient ignorées.',
        ],
      },
      tr: {
        title: 'Yeni bir görsel kimlik ve Eğitim modu',
        items: [
          'Temel\'in tüm arayüzü yeni açılış sayfasının görsel kimliğiyle.',
          'Her profil tam konturuna çözümleniyor. Konturu yoksa uygulama, eksik kalınlıkları uydurmak yerine gerilme hesaplamıyor.',
          'Öğretmen alıştırmayı uygulamanın içinde hazırlıyor, öğrenci çözüyor; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor.',
          'Betonarme temeller: donatı boyutlandırmasından bir CAD dosyasına, donatı açılımı 3B olarak.',
          'Kontrollerde düzeltmeler: güvensiz taraftaki varsayılan değerler, eksik sınır durumları ve göz ardı edilen girdiler.',
        ],
      },
    },
  },
  {
    date: '2026-08-07',
    areas: ['site', 'pro', 'engine'],
    i18n: {
      es: {
        title: 'Landing nueva y reglamentos CIRSOC 2025',
        items: [
          'La landing se rehízo: explica qué es Stabileo, qué funciona hoy y qué está en desarrollo, con secciones para el Básico, el Educativo y el PRO.',
          'Cargas y verificaciones según los reglamentos CIRSOC 2025, con la edición de cada reglamento registrada en el proyecto.',
          'Posproceso y visor 3D más rápidos en modelos grandes.',
        ],
      },
      en: {
        title: 'A new landing page, and the 2025 CIRSOC codes',
        items: [
          'The landing page was rebuilt: it explains what Stabileo is, what works today and what is in development, with sections for Basic, Education and PRO.',
          'Loads and design checks per the 2025 CIRSOC codes, with the edition of each code recorded in the project.',
          'Faster post-processing and 3D viewer on large models.',
        ],
      },
      pt: {
        title: 'Landing nova e normas CIRSOC 2025',
        items: [
          'A landing foi refeita: explica o que é o Stabileo, o que funciona hoje e o que está em desenvolvimento, com seções para o Básico, o Educativo e o PRO.',
          'Cargas e verificações segundo as normas CIRSOC 2025, com a edição de cada norma registrada no projeto.',
          'Pós-processamento e visualizador 3D mais rápidos em modelos grandes.',
        ],
      },
      de: {
        title: 'Eine neue Startseite und die CIRSOC-Normen 2025',
        items: [
          'Die Startseite wurde neu aufgebaut: Sie erklärt, was Stabileo ist, was heute funktioniert und was in Entwicklung ist, mit Abschnitten zu Basis, Lehre und PRO.',
          'Lasten und Nachweise nach den CIRSOC-Normen 2025, wobei die Ausgabe jeder Norm im Projekt festgehalten wird.',
          'Schnellere Nachbearbeitung und eine schnellere 3D-Ansicht bei großen Modellen.',
        ],
      },
      fr: {
        title: 'Une nouvelle page d\'accueil, et les règlements CIRSOC 2025',
        items: [
          'La page d\'accueil a été refaite : elle explique ce qu\'est Stabileo, ce qui fonctionne aujourd\'hui et ce qui est en développement, avec des sections pour Basique, Enseignement et PRO.',
          'Charges et vérifications selon les règlements CIRSOC 2025, avec l\'édition de chaque règlement enregistrée dans le projet.',
          'Post-traitement et vue 3D plus rapides sur les grands modèles.',
        ],
      },
      tr: {
        title: 'Yeni açılış sayfası ve CIRSOC 2025 yönetmelikleri',
        items: [
          'Açılış sayfası yeniden yapıldı: Stabileo\'nun ne olduğunu, bugün neyin çalıştığını ve neyin geliştirilmekte olduğunu Temel, Eğitim ve PRO bölümleriyle anlatıyor.',
          'CIRSOC 2025 yönetmeliklerine göre yükler ve kontroller; her yönetmeliğin baskısı projeye kaydediliyor.',
          'Büyük modellerde daha hızlı son işlem ve 3B görüntüleyici.',
        ],
      },
    },
  },
  {
    date: '2026-07-31',
    areas: ['app', 'engine', 'engine'],
    i18n: {
      es: {
        title: 'Resultados que siempre corresponden al modelo',
        items: [
          'Al editar el modelo se invalidan los resultados y las verificaciones que quedaron desactualizados, para no mostrar resultados que ya no corresponden.',
          'Cálculos más rápidos: los casos de carga reusan la factorización, las combinaciones se resuelven en lote y el cálculo corre en segundo plano.',
          'Correcciones en restricciones y apoyos inclinados.',
        ],
      },
      en: {
        title: 'Results that always match the model',
        items: [
          'Editing the model invalidates the results and design checks it made stale, so results that no longer apply are never shown.',
          'Faster analysis: load cases reuse the factorization, combinations are solved in batches and the analysis runs in the background.',
          'Fixes to constraints and inclined supports.',
        ],
      },
      pt: {
        title: 'Resultados que sempre correspondem ao modelo',
        items: [
          'Ao editar o modelo, os resultados e as verificações desatualizados são invalidados, para não mostrar resultados que já não correspondem.',
          'Cálculos mais rápidos: os casos de carga reutilizam a fatoração, as combinações são resolvidas em lote e o cálculo roda em segundo plano.',
          'Correções em vínculos e apoios inclinados.',
        ],
      },
      de: {
        title: 'Ergebnisse, die immer zum Modell passen',
        items: [
          'Wird das Modell bearbeitet, werden die dadurch veralteten Ergebnisse und Nachweise ungültig, sodass nie Ergebnisse angezeigt werden, die nicht mehr gelten.',
          'Schnellere Berechnung: Lastfälle verwenden die Faktorisierung wieder, Kombinationen werden gebündelt gelöst und die Berechnung läuft im Hintergrund.',
          'Korrekturen an Kopplungen und geneigten Auflagern.',
        ],
      },
      fr: {
        title: 'Des résultats qui correspondent toujours au modèle',
        items: [
          'Modifier le modèle invalide les résultats et les vérifications devenus obsolètes, si bien que des résultats qui ne s\'appliquent plus ne sont jamais affichés.',
          'Calcul plus rapide : les cas de charge réutilisent la factorisation, les combinaisons sont résolues par lots et le calcul s\'exécute en arrière-plan.',
          'Corrections des liaisons et des appuis inclinés.',
        ],
      },
      tr: {
        title: 'Her zaman modele karşılık gelen sonuçlar',
        items: [
          'Model düzenlendiğinde güncelliğini yitiren sonuçlar ve kontroller geçersiz sayılıyor; böylece artık geçerli olmayan sonuçlar hiçbir zaman gösterilmiyor.',
          'Daha hızlı analiz: yük durumları ayrıştırmayı yeniden kullanıyor, kombinasyonlar toplu çözülüyor ve analiz arka planda çalışıyor.',
          'Kısıtlarda ve eğik mesnetlerde düzeltmeler.',
        ],
      },
    },
  },
  {
    date: '2026-07-24',
    areas: ['pro'],
    i18n: {
      es: {
        title: 'Importador de planos DXF',
        items: [
          'El importador de planos DXF suma vista previa y diagnósticos, control de unidades, varias plantas e interpretación de vigas, con un asistente más claro.',
        ],
      },
      en: {
        title: 'DXF drawing importer',
        items: [
          'The DXF drawing importer adds a preview and diagnostics, unit control, multiple floors and beam interpretation, with a clearer wizard.',
        ],
      },
      pt: {
        title: 'Importador de plantas DXF',
        items: [
          'O importador de plantas DXF ganhou pré-visualização e diagnósticos, controle de unidades, vários pavimentos e interpretação de vigas, com um assistente mais claro.',
        ],
      },
      de: {
        title: 'Import von DXF-Plänen',
        items: [
          'Der Import von DXF-Plänen erhält eine Vorschau und Diagnosen, eine Einheitenkontrolle, mehrere Geschosse und die Erkennung von Balken, mit einem übersichtlicheren Assistenten.',
        ],
      },
      fr: {
        title: 'Import de plans DXF',
        items: [
          'L\'import de plans DXF gagne un aperçu et des diagnostics, le contrôle des unités, plusieurs niveaux et l\'interprétation des poutres, avec un assistant plus clair.',
        ],
      },
      tr: {
        title: 'DXF plan içe aktarıcı',
        items: [
          'DXF plan içe aktarıcıya önizleme ve tanılama, birim kontrolü, birden çok kat ve kiriş yorumlama eklendi; sihirbaz da daha anlaşılır.',
        ],
      },
    },
  },
  {
    date: '2026-06-26',
    areas: ['basic'],
    i18n: {
      es: {
        title: 'Despiece de barras en el Básico',
        items: [
          'Despiece (cuerpo libre) de barras en 2D y 3D, con articulaciones deslizantes en 2D y de seis grados de libertad en 3D, e inspección de los vectores en cada extremo.',
        ],
      },
      en: {
        title: 'Member free-body diagrams in Basic',
        items: [
          'Free-body diagrams of members in 2D and 3D, with sliding hinges in 2D and six-degree-of-freedom releases in 3D, and the force vectors at each end.',
        ],
      },
      pt: {
        title: 'Diagramas de corpo livre no Básico',
        items: [
          'Diagramas de corpo livre de barras em 2D e 3D, com articulações deslizantes em 2D e de seis graus de liberdade em 3D, e os vetores em cada extremidade.',
        ],
      },
      de: {
        title: 'Freikörperbilder der Stäbe in Basis',
        items: [
          'Freikörperbilder von Stäben in 2D und 3D, mit Schiebegelenken in 2D und Freigaben in allen sechs Freiheitsgraden in 3D sowie den Kraftvektoren an jedem Ende.',
        ],
      },
      fr: {
        title: 'Les corps libres des barres dans Basique',
        items: [
          'Corps libres des barres en 2D et en 3D, avec des rotules glissantes en 2D et des libérations sur les six degrés de liberté en 3D, et les vecteurs d\'effort à chaque extrémité.',
        ],
      },
      tr: {
        title: 'Temel\'de çubukların serbest cisim diyagramları',
        items: [
          'Çubukların 2B ve 3B serbest cisim diyagramları; 2B\'de kayan mafsallar, 3B\'de altı serbestlik derecesinde serbestlikler ve her uçtaki kuvvet vektörleri.',
        ],
      },
    },
  },
  {
    date: '2026-06-19',
    areas: ['pro', 'pro', 'basic'],
    i18n: {
      es: {
        title: 'Del plano de CAD al modelo de hormigón',
        items: [
          'De un plano DXF a un borrador estructural de hormigón armado: asistente con clasificación de capas, plantilla descargable y ejemplos.',
          'Convención de ejes locales en 3D corregida en la interfaz y en el motor, con migración de los modelos existentes.',
          'Ejes y secciones unificados en el Básico 2D y 3D.',
        ],
      },
      en: {
        title: 'From a CAD drawing to a concrete model',
        items: [
          'From a DXF drawing to a reinforced concrete structural draft: a wizard that classifies layers, a downloadable template and examples.',
          'The 3D local-axis convention fixed in the interface and in the engine, with existing models migrated.',
          'Axes and sections unified across Basic 2D and 3D.',
        ],
      },
      pt: {
        title: 'Da planta de CAD ao modelo de concreto',
        items: [
          'De uma planta DXF a um rascunho estrutural de concreto armado: assistente com classificação de camadas, modelo para baixar e exemplos.',
          'Convenção de eixos locais em 3D corrigida na interface e no motor, com migração dos modelos existentes.',
          'Eixos e seções unificados no Básico 2D e 3D.',
        ],
      },
      de: {
        title: 'Vom CAD-Plan zum Stahlbetonmodell',
        items: [
          'Von einem DXF-Plan zu einem Tragwerksentwurf in Stahlbeton: ein Assistent, der Layer klassifiziert, eine herunterladbare Vorlage und Beispiele.',
          'Die Konvention der lokalen Achsen in 3D wurde in der Oberfläche und im Rechenkern korrigiert, und bestehende Modelle wurden migriert.',
          'Achsen und Querschnitte in Basis 2D und 3D vereinheitlicht.',
        ],
      },
      fr: {
        title: 'Du plan CAO au modèle en béton armé',
        items: [
          'D\'un plan DXF à une ébauche de structure en béton armé : un assistant qui classe les calques, un gabarit téléchargeable et des exemples.',
          'La convention des axes locaux en 3D corrigée dans l\'interface et dans le moteur, avec migration des modèles existants.',
          'Axes et sections unifiés dans Basique 2D et 3D.',
        ],
      },
      tr: {
        title: 'CAD planından betonarme modele',
        items: [
          'Bir DXF planından betonarme bir yapı taslağına: katmanları sınıflandıran bir sihirbaz, indirilebilir bir şablon ve örnekler.',
          '3B yerel eksen kuralı arayüzde ve motorda düzeltildi; mevcut modeller de taşındı.',
          'Temel 2B ve 3B\'de eksenler ve kesitler birleştirildi.',
        ],
      },
    },
  },
  {
    date: '2026-06-12',
    areas: ['pro', 'pro', 'pro', 'pro', 'basic'],
    shot: {
      base: 'pro-building-axial',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Los esfuerzos normales de un edificio en el modo PRO, con perfiles reales en el visor 3D',
        en: 'Axial forces in a building in PRO mode, with real section shapes in the 3D viewer',
        pt: 'Os esforços normais de um edifício no modo PRO, com perfis reais no visualizador 3D',
        de: 'Die Normalkräfte eines Gebäudes im PRO-Modus, mit realen Querschnittsformen in der 3D-Ansicht',
        fr: 'Les efforts normaux d\'un bâtiment dans le mode PRO, avec les formes réelles des sections dans la vue 3D',
        tr: 'PRO modunda bir binanın normal kuvvetleri; 3B görüntüleyicide gerçek kesit şekilleriyle',
      },
    },
    i18n: {
      es: {
        title: 'Un flujo profesional en el PRO',
        items: [
          'Diseño, cargas e informe de cálculo integrados en el PRO, con las verificaciones de diseño unificadas.',
          'Consulta de resultados por caso, combinación y envolvente.',
          'Visor 3D con perfiles reales y ejes locales, y excentricidades de barras para modelar vigas en la cara de la columna.',
          'Losas y muros con visualización, ejes, tensiones principales e informe.',
          'El modo Básico se reescribió, con límites más claros frente al PRO.',
        ],
      },
      en: {
        title: 'A professional workflow in PRO',
        items: [
          'Design, loads and the calculation report working together in PRO, with unified design checks.',
          'Results by load case, combination and envelope.',
          'A 3D viewer with real section shapes and local axes, and member offsets to model beams framing into the column face.',
          'Slabs and walls with display, axes, principal stresses and report.',
          'Basic mode was rewritten, with a clearer line between it and PRO.',
        ],
      },
      pt: {
        title: 'Um fluxo profissional no PRO',
        items: [
          'Dimensionamento, cargas e relatório de cálculo integrados no PRO, com as verificações de dimensionamento unificadas.',
          'Consulta de resultados por caso, combinação e envoltória.',
          'Visualizador 3D com perfis reais e eixos locais, e excentricidades de barras para modelar vigas na face do pilar.',
          'Lajes e paredes com visualização, eixos, tensões principais e relatório.',
          'O modo Básico foi reescrito, com limites mais claros em relação ao PRO.',
        ],
      },
      de: {
        title: 'Ein professioneller Arbeitsablauf in PRO',
        items: [
          'Bemessung, Lasten und statische Berechnung greifen in PRO ineinander, mit vereinheitlichten Nachweisen.',
          'Ergebnisse nach Lastfall, Kombination und Einhüllender.',
          'Eine 3D-Ansicht mit realen Querschnittsformen und lokalen Achsen sowie Stabversätze, um Balken an der Stützenseite anzuschließen.',
          'Decken und Wände mit Darstellung, Achsen, Hauptspannungen und Bericht.',
          'Der Basis-Modus wurde neu geschrieben, mit einer klareren Abgrenzung zu PRO.',
        ],
      },
      fr: {
        title: 'Un flux de travail professionnel dans PRO',
        items: [
          'Dimensionnement, charges et note de calcul fonctionnent ensemble dans PRO, avec des vérifications unifiées.',
          'Résultats par cas de charge, par combinaison et par enveloppe.',
          'Une vue 3D avec les formes réelles des sections et les axes locaux, et des excentrements de barres pour modéliser les poutres au nu du poteau.',
          'Dalles et voiles avec affichage, axes, contraintes principales et note de calcul.',
          'Le mode Basique a été réécrit, avec une séparation plus nette par rapport à PRO.',
        ],
      },
      tr: {
        title: 'PRO\'da profesyonel bir iş akışı',
        items: [
          'PRO\'da boyutlandırma, yükler ve hesap raporu birlikte çalışıyor; kontroller de birleştirildi.',
          'Yük durumu, kombinasyon ve zarfa göre sonuçlar.',
          'Gerçek kesit şekilleri ve yerel eksenlerle bir 3B görüntüleyici; kirişleri kolon yüzünde modellemek için çubuk kaçıklıkları.',
          'Görüntüleme, eksenler, asal gerilmeler ve raporla döşemeler ve perde duvarlar.',
          'Temel modu yeniden yazıldı; PRO ile arasındaki sınır daha net.',
        ],
      },
    },
  },
  {
    date: '2026-04-01',
    period: 'month',
    areas: ['site', 'engine', 'engine', 'app', 'app', 'app'],
    i18n: {
      es: {
        title: 'Un visor 3D más fluido y un motor más robusto',
        items: [
          'Una landing rediseñada.',
          'Cerca de mil tests nuevos de robustez, con correcciones de exactitud en el motor, los elementos y las restricciones, y avisos de inestabilidad antes de calcular.',
          'Articulaciones en 3D liberadas eje por eje en cada extremo de barra.',
          'El visor 3D se mueve con fluidez en modelos de más de mil nodos: los nodos se dibujan de una vez y la selección de barras es más rápida.',
          'Los ejes quedaron unificados con Z hacia arriba en toda la app, y se corrigieron los momentos My y Mz en tensiones y verificaciones.',
          'Correcciones en el guardado, los links compartidos y las exportaciones.',
        ],
      },
      en: {
        title: 'A smoother 3D viewer and a sturdier engine',
        items: [
          'A redesigned landing page.',
          'Close to a thousand new robustness tests, with accuracy fixes in the engine, the elements and the constraints, and instability warnings before the analysis runs.',
          'Hinges in 3D released axis by axis at each member end.',
          'The 3D viewer moves smoothly on models with over a thousand nodes: nodes are drawn in one pass and picking members is faster.',
          'Axes were unified with Z up across the app, and the My and Mz moments were fixed in stresses and design checks.',
          'Fixes to saving, shared links and exports.',
        ],
      },
      pt: {
        title: 'Um visualizador 3D mais fluido e um motor mais robusto',
        items: [
          'Uma landing redesenhada.',
          'Perto de mil testes novos de robustez, com correções de exatidão no motor, nos elementos e nas restrições, e avisos de instabilidade antes de calcular.',
          'Articulações em 3D liberadas eixo por eixo em cada extremidade da barra.',
          'O visualizador 3D se move com fluidez em modelos com mais de mil nós: os nós são desenhados de uma vez e a seleção de barras ficou mais rápida.',
          'Os eixos foram unificados com Z para cima em todo o app, e os momentos My e Mz foram corrigidos nas tensões e verificações.',
          'Correções no salvamento, nos links compartilhados e nas exportações.',
        ],
      },
      de: {
        title: 'Eine flüssigere 3D-Ansicht und ein robusterer Rechenkern',
        items: [
          'Eine neu gestaltete Startseite.',
          'Fast tausend neue Robustheitstests, mit Genauigkeitskorrekturen im Rechenkern, in den Elementen und den Kopplungen, sowie Warnungen vor Instabilität, bevor die Berechnung läuft.',
          'Gelenke in 3D, an jedem Stabende Achse für Achse freigegeben.',
          'Die 3D-Ansicht bewegt sich bei Modellen mit über tausend Knoten flüssig: Die Knoten werden in einem Durchgang gezeichnet, und die Auswahl von Stäben ist schneller.',
          'Die Achsen wurden in der ganzen App mit Z nach oben vereinheitlicht, und die Momente My und Mz wurden in Spannungen und Nachweisen korrigiert.',
          'Korrekturen beim Speichern, bei geteilten Links und bei Exporten.',
        ],
      },
      fr: {
        title: 'Une vue 3D plus fluide et un moteur plus robuste',
        items: [
          'Une page d\'accueil repensée.',
          'Près de mille nouveaux tests de robustesse, avec des corrections de précision dans le moteur, les éléments et les liaisons, et des avertissements d\'instabilité avant le calcul.',
          'Rotules en 3D libérées axe par axe à chaque extrémité de barre.',
          'La vue 3D reste fluide sur des modèles de plus de mille nœuds : les nœuds sont dessinés en une seule passe et la sélection des barres est plus rapide.',
          'Les axes ont été unifiés avec Z vers le haut dans toute l\'application, et les moments My et Mz ont été corrigés dans les contraintes et les vérifications.',
          'Corrections de l\'enregistrement, des liens partagés et des exports.',
        ],
      },
      tr: {
        title: 'Daha akıcı bir 3B görüntüleyici ve daha sağlam bir motor',
        items: [
          'Yeniden tasarlanmış bir açılış sayfası.',
          'Bine yakın yeni sağlamlık testi; motorda, elemanlarda ve kısıtlarda doğruluk düzeltmeleri ve analiz çalışmadan önce kararsızlık uyarıları.',
          '3B\'de her çubuk ucunda eksen eksen serbest bırakılan mafsallar.',
          '3B görüntüleyici bini aşkın düğümlü modellerde akıcı hareket ediyor: düğümler tek geçişte çiziliyor ve çubuk seçimi daha hızlı.',
          'Eksenler uygulamanın tamamında Z yukarı olacak biçimde birleştirildi; gerilmelerde ve kontrollerde My ve Mz momentleri düzeltildi.',
          'Kaydetmede, paylaşılan bağlantılarda ve dışa aktarmalarda düzeltmeler.',
        ],
      },
    },
  },
  {
    date: '2026-03-01',
    period: 'month',
    areas: ['engine', 'engine', 'engine', 'engine', 'site', 'pro', 'pro', 'edu', 'basic', 'app'],
    shot: {
      base: '3d-frame',
      w: 1600,
      h: 876,
      alt: {
        es: 'Un pórtico espacial con su diagrama de momentos en 3D',
        en: 'A space frame with its bending moment diagram in 3D',
        pt: 'Um pórtico espacial com seu diagrama de momentos em 3D',
        de: 'Ein räumlicher Rahmen mit seiner Momentenlinie in 3D',
        fr: 'Un portique spatial avec son diagramme des moments en 3D',
        tr: '3B eğilme momenti diyagramıyla bir uzay çerçeve',
      },
    },
    i18n: {
      es: {
        title: 'El motor en Rust, el modo PRO y el nombre Stabileo',
        items: [
          'El motor de cálculo se reescribió en Rust y corre en el navegador con WebAssembly. Antes de reemplazar al anterior, se comparó con él en 90 modelos.',
          'Más de dos mil tests de validación contra soluciones de libros de texto y casos de referencia publicados.',
          'Análisis no lineal geométrico y de material, dinámica modal, espectral y en el tiempo, placas y cáscaras, cables, construcción por etapas y fundaciones sobre resortes.',
          'Un solver para matrices dispersas que acelera los modelos grandes: el análisis modal en 3D pasó a ser 11,8 veces más rápido.',
          'El proyecto pasó a llamarse Stabileo, con dominio propio, landing y la interfaz en 14 idiomas.',
          'El modo PRO, con verificación de hormigón armado según CIRSOC 201, cargas automáticas, diagnósticos e informe de cálculo.',
          'Un flujo de hormigón armado con la combinación que gobierna cada barra, verificación automática, armado y nudos, y ejemplos grandes como un estadio de 1005 nodos.',
          'El modo Educativo, con ejercicios guiados que se corrigen paso a paso.',
          'El modo Básico suma la vista 3D y el pase de modelos de 3D a 2D.',
          'Un asistente con IA que arma y edita modelos a partir de una conversación.',
        ],
      },
      en: {
        title: 'The engine in Rust, PRO mode and the Stabileo name',
        items: [
          'The analysis engine was rewritten in Rust and runs in the browser through WebAssembly. Before it replaced the old one, the two were compared on 90 models.',
          'Over two thousand validation tests against textbook solutions and published reference cases.',
          'Geometric and material nonlinear analysis, modal, spectral and time-history dynamics, plates and shells, cables, staged construction and foundations on springs.',
          'A sparse matrix solver that speeds up large models: 3D modal analysis became 11.8 times faster.',
          'The project was renamed Stabileo, with its own domain, a landing page and the interface in 14 languages.',
          'PRO mode, with reinforced concrete checks to CIRSOC 201, automatic loads, diagnostics and a calculation report.',
          'A reinforced concrete workflow with the governing combination for each member, automatic checks, detailing and joints, and large examples such as a 1005-node stadium.',
          'Education mode, with guided exercises checked step by step.',
          'Basic mode adds the 3D view and turning 3D models into 2D ones.',
          'An AI assistant that builds and edits models from a conversation.',
        ],
      },
      pt: {
        title: 'O motor em Rust, o modo PRO e o nome Stabileo',
        items: [
          'O motor de cálculo foi reescrito em Rust e roda no navegador com WebAssembly. Antes de substituir o anterior, os dois foram comparados em 90 modelos.',
          'Mais de dois mil testes de validação contra soluções de livros-texto e casos de referência publicados.',
          'Análise não linear geométrica e de material, dinâmica modal, espectral e no tempo, placas e cascas, cabos, construção em etapas e fundações sobre molas.',
          'Um solver para matrizes esparsas que acelera os modelos grandes: a análise modal em 3D ficou 11,8 vezes mais rápida.',
          'O projeto passou a se chamar Stabileo, com domínio próprio, landing e a interface em 14 idiomas.',
          'O modo PRO, com verificação de concreto armado segundo a CIRSOC 201, cargas automáticas, diagnósticos e relatório de cálculo.',
          'Um fluxo de concreto armado com a combinação que governa cada barra, verificação automática, armação e nós, e exemplos grandes como um estádio de 1005 nós.',
          'O modo Educativo, com exercícios guiados corrigidos passo a passo.',
          'O modo Básico ganha a vista 3D e a passagem de modelos de 3D para 2D.',
          'Um assistente com IA que monta e edita modelos a partir de uma conversa.',
        ],
      },
      de: {
        title: 'Der Rechenkern in Rust, der PRO-Modus und der Name Stabileo',
        items: [
          'Der Rechenkern wurde in Rust neu geschrieben und läuft über WebAssembly im Browser. Bevor er den alten ersetzte, wurden beide an 90 Modellen verglichen.',
          'Über zweitausend Validierungstests gegen Lehrbuchlösungen und veröffentlichte Referenzfälle.',
          'Geometrisch und materiell nichtlineare Berechnung, Dynamik modal, mit Antwortspektrum und im Zeitverlauf, Platten und Schalen, Seile, Berechnung in Bauphasen und federnd gelagerte Gründungen.',
          'Ein Löser für dünnbesetzte Matrizen, der große Modelle beschleunigt: Die Modalanalyse in 3D wurde 11,8-mal schneller.',
          'Das Projekt wurde in Stabileo umbenannt, mit eigener Domain, einer Startseite und der Oberfläche in 14 Sprachen.',
          'Der PRO-Modus, mit Stahlbetonnachweisen nach CIRSOC 201, automatischen Lasten, Diagnosen und statischer Berechnung.',
          'Ein Arbeitsablauf für Stahlbeton mit der maßgebenden Kombination für jeden Stab, automatischen Nachweisen, Bewehrungsführung und Knoten, sowie großen Beispielen wie einem Stadion mit 1005 Knoten.',
          'Der Lehrmodus, mit geführten Übungen, die Schritt für Schritt bewertet werden.',
          'Der Basis-Modus erhält die 3D-Ansicht und die Umwandlung von 3D-Modellen in 2D-Modelle.',
          'Ein KI-Assistent, der Modelle aus einem Gespräch heraus erstellt und bearbeitet.',
        ],
      },
      fr: {
        title: 'Le moteur en Rust, le mode PRO et le nom Stabileo',
        items: [
          'Le moteur de calcul a été réécrit en Rust et s\'exécute dans le navigateur grâce à WebAssembly. Avant qu\'il remplace l\'ancien, les deux ont été comparés sur 90 modèles.',
          'Plus de deux mille tests de validation par rapport à des solutions de manuels et à des cas de référence publiés.',
          'Analyse non linéaire géométrique et matérielle, dynamique modale, spectrale et temporelle, plaques et coques, câbles, construction par phases et fondations sur ressorts.',
          'Un solveur pour matrices creuses qui accélère les grands modèles : l\'analyse modale en 3D est devenue 11,8 fois plus rapide.',
          'Le projet a été renommé Stabileo, avec son propre domaine, une page d\'accueil et l\'interface en 14 langues.',
          'Le mode PRO, avec la vérification du béton armé selon le CIRSOC 201, des charges automatiques, des diagnostics et une note de calcul.',
          'Un flux de travail pour le béton armé avec la combinaison déterminante pour chaque barre, la vérification automatique, le ferraillage et les nœuds, et de grands exemples comme un stade de 1005 nœuds.',
          'Le mode Enseignement, avec des exercices guidés corrigés pas à pas.',
          'Le mode Basique ajoute la vue 3D et le passage de modèles 3D en modèles 2D.',
          'Un assistant d\'IA qui construit et modifie des modèles à partir d\'une conversation.',
        ],
      },
      tr: {
        title: 'Rust ile yazılan motor, PRO modu ve Stabileo adı',
        items: [
          'Hesap motoru Rust ile yeniden yazıldı ve tarayıcıda WebAssembly ile çalışıyor. Eskisinin yerini almadan önce ikisi 90 model üzerinde karşılaştırıldı.',
          'Ders kitabı çözümlerine ve yayımlanmış referans durumlara karşı iki binden fazla doğrulama testi.',
          'Geometrik ve malzeme bakımından doğrusal olmayan analiz; modal, spektral ve zaman tanım alanında dinamik; plaklar ve kabuklar, kablolar, aşamalı yapım ve yaylar üzerinde temeller.',
          'Büyük modelleri hızlandıran bir seyrek matris çözücüsü: 3B modal analiz 11,8 kat hızlandı.',
          'Projenin adı Stabileo oldu; kendi alan adı, bir açılış sayfası ve 14 dilde arayüzle.',
          'CIRSOC 201\'e göre betonarme kontrolleri, otomatik yükler, tanılamalar ve hesap raporuyla PRO modu.',
          'Her çubuk için belirleyici kombinasyonu, otomatik kontrolleri, donatı detaylandırmayı ve düğümleri içeren bir betonarme iş akışı ve 1005 düğümlü bir stadyum gibi büyük örnekler.',
          'Adım adım değerlendirilen rehberli alıştırmalarla Eğitim modu.',
          'Temel moduna 3B görünüm ve 3B modellerin 2B\'ye dönüştürülmesi eklendi.',
          'Bir konuşmadan modeller oluşturan ve düzenleyen bir yapay zekâ asistanı.',
        ],
      },
    },
  },
  {
    date: '2026-02-01',
    period: 'month',
    areas: ['basic', 'basic', 'basic', 'basic', 'engine', 'edu', 'app'],
    shot: {
      base: '2d-moments',
      w: 1600,
      h: 997,
      alt: {
        es: 'Un pórtico plano con su diagrama de momentos flectores en el modo Básico',
        en: 'A plane frame with its bending moment diagram in Basic mode',
        pt: 'Um pórtico plano com seu diagrama de momentos fletores no modo Básico',
        de: 'Ein ebener Rahmen mit seiner Momentenlinie im Basis-Modus',
        fr: 'Un portique plan avec son diagramme des moments fléchissants dans le mode Basique',
        tr: 'Temel modunda eğilme momenti diyagramıyla bir düzlem çerçeve',
      },
    },
    i18n: {
      es: {
        title: 'El comienzo: un editor de estructuras en el navegador',
        items: [
          'La primera versión, el 10 de febrero: barras, apoyos y cargas en 2D, con reacciones, diagramas y deformada, sin instalar nada.',
          'Cargas puntuales, distribuidas parciales y móviles, casos de carga, combinaciones y envolventes con sus dos curvas.',
          'Secciones de acero y de hormigón con un constructor de perfiles, y tensiones en la sección por Navier, Jourawski y Von Mises.',
          'Apoyos inclinados, resortes y asentamientos, y peso propio de las barras.',
          'Un motor 3D con seis grados de libertad por nodo y su visor, además de P-Delta, pandeo y líneas de influencia en 2D.',
          'Análisis cinemático didáctico, que explica barra por barra por qué una estructura es o no un mecanismo.',
          'Interfaz para celulares, links compartidos que llevan el modelo, un recorrido guiado y atajos de teclado.',
        ],
      },
      en: {
        title: 'The beginning: a structural editor in the browser',
        items: [
          'The first version, on 10 February: members, supports and loads in 2D, with reactions, diagrams and the deflected shape, with nothing to install.',
          'Point, partial distributed and moving loads, load cases, combinations and envelopes with both curves.',
          'Steel and concrete sections with a section builder, and stresses in the section by Navier, Jourawski and Von Mises.',
          'Inclined supports, springs and settlements, and member self-weight.',
          'A 3D engine with six degrees of freedom per node and its viewer, plus P-Delta, buckling and influence lines in 2D.',
          'A teaching kinematic analysis that explains, member by member, why a structure is or is not a mechanism.',
          'A mobile interface, shared links that carry the model, a guided tour and keyboard shortcuts.',
        ],
      },
      pt: {
        title: 'O começo: um editor de estruturas no navegador',
        items: [
          'A primeira versão, em 10 de fevereiro: barras, apoios e cargas em 2D, com reações, diagramas e deformada, sem instalar nada.',
          'Cargas pontuais, distribuídas parciais e móveis, casos de carga, combinações e envoltórias com suas duas curvas.',
          'Seções de aço e de concreto com um construtor de perfis, e tensões na seção por Navier, Jourawski e Von Mises.',
          'Apoios inclinados, molas e recalques, e peso próprio das barras.',
          'Um motor 3D com seis graus de liberdade por nó e seu visualizador, além de P-Delta, flambagem e linhas de influência em 2D.',
          'Análise cinemática didática, que explica barra por barra por que uma estrutura é ou não um mecanismo.',
          'Interface para celulares, links compartilhados que levam o modelo, um tour guiado e atalhos de teclado.',
        ],
      },
      de: {
        title: 'Der Anfang: ein Tragwerkseditor im Browser',
        items: [
          'Die erste Version, am 10. Februar: Stäbe, Auflager und Lasten in 2D, mit Auflagerreaktionen, Schnittgrößenverläufen und Verformungsfigur, ohne etwas zu installieren.',
          'Einzellasten, abschnittsweise Streckenlasten und Wanderlasten, Lastfälle, Kombinationen und Einhüllende mit ihren beiden Kurven.',
          'Stahl- und Betonquerschnitte mit einem Profileditor sowie Spannungen im Querschnitt nach Navier, Jourawski und von Mises.',
          'Geneigte Auflager, Federn und Setzungen sowie das Eigengewicht der Stäbe.',
          'Ein 3D-Rechenkern mit sechs Freiheitsgraden je Knoten und seine Ansicht, dazu P-Delta, Knicken und Einflusslinien in 2D.',
          'Eine kinematische Analyse für die Lehre, die Stab für Stab erklärt, warum ein Tragwerk ein Mechanismus ist oder nicht.',
          'Eine Oberfläche für Mobilgeräte, geteilte Links, die das Modell mitnehmen, eine geführte Tour und Tastenkürzel.',
        ],
      },
      fr: {
        title: 'Les débuts : un éditeur de structures dans le navigateur',
        items: [
          'La première version, le 10 février : barres, appuis et charges en 2D, avec réactions, diagrammes et déformée, sans rien installer.',
          'Charges ponctuelles, réparties partielles et mobiles, cas de charge, combinaisons et enveloppes avec leurs deux courbes.',
          'Sections en acier et en béton avec un constructeur de profilés, et contraintes dans la section selon Navier, Jourawski et von Mises.',
          'Appuis inclinés, ressorts et tassements, et poids propre des barres.',
          'Un moteur 3D à six degrés de liberté par nœud et sa vue, ainsi que P-Delta, flambement et lignes d\'influence en 2D.',
          'Une analyse cinématique pédagogique, qui explique barre par barre pourquoi une structure est ou n\'est pas un mécanisme.',
          'Une interface pour mobile, des liens partagés qui transportent le modèle, une visite guidée et des raccourcis clavier.',
        ],
      },
      tr: {
        title: 'Başlangıç: tarayıcıda bir yapı düzenleyici',
        items: [
          'İlk sürüm, 10 Şubat\'ta: 2B\'de çubuklar, mesnetler ve yükler; tepkiler, diyagramlar ve şekil değiştirmiş durumla, hiçbir şey kurmadan.',
          'Tekil, kısmi yayılı ve hareketli yükler, yük durumları, kombinasyonlar ve iki eğrisiyle zarflar.',
          'Profil oluşturucuyla çelik ve beton kesitler; Navier, Jourawski ve von Mises\'e göre kesit gerilmeleri.',
          'Eğik mesnetler, yaylar ve oturmalar ile çubukların öz ağırlığı.',
          'Düğüm başına altı serbestlik dereceli bir 3B motor ve görüntüleyicisi; ayrıca 2B\'de P-Delta, burkulma ve tesir çizgileri.',
          'Bir yapının neden mekanizma olduğunu ya da olmadığını çubuk çubuk açıklayan öğretici bir kinematik analiz.',
          'Mobil arayüz, modeli taşıyan paylaşılan bağlantılar, rehberli tur ve klavye kısayolları.',
        ],
      },
    },
  },
];

export const AREA_LABELS: Record<PublicLocale, Record<ChangelogArea, string>> = {
  es: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Sitio' },
  en: { basic: 'Basic', pro: 'PRO', edu: 'Education', app: 'App', engine: 'Engine', site: 'Website' },
  pt: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Site' },
  de: { basic: 'Basis', pro: 'PRO', edu: 'Lehre', app: 'App', engine: 'Rechenkern', site: 'Website' },
  fr: { basic: 'Basique', pro: 'PRO', edu: 'Enseignement', app: 'Application', engine: 'Moteur', site: 'Site' },
  tr: { basic: 'Temel', pro: 'PRO', edu: 'Eğitim', app: 'Uygulama', engine: 'Motor', site: 'Site' },
};

/** Parsed by parts, so no time zone moves the day back. */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatChangeDate(iso: string, locale: string): string {
  return localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function changeStamp(entry: ChangelogEntry, locale: string): { big: string; small: string | null } {
  const date = localDay(entry.date);
  const month = date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, '');
  return entry.period === 'month' ? { big: month, small: null } : { big: String(date.getDate()), small: month };
}

export function formatChangeWhen(entry: ChangelogEntry, locale: string): string {
  return entry.period === 'month' ? formatChangeMonth(entry.date, locale) : formatChangeDate(entry.date, locale);
}

export function formatChangeMonth(iso: string, locale: string, { capitalize = true } = {}): string {
  const text = localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  return capitalize ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

export function entryAreas(entry: ChangelogEntry): ChangelogArea[] {
  return [...new Set(entry.areas)];
}

export function itemsByArea(entry: ChangelogEntry, locale: PublicLocale): { area: ChangelogArea; items: string[] }[] {
  const items = entry.i18n[locale].items;
  return entryAreas(entry).map((area) => ({ area, items: items.filter((_, i) => entry.areas[i] === area) }));
}

/** Expects entries newest first, as CHANGELOG is. */
export function changelogByMonth(entries: ChangelogEntry[]): { key: string; entries: ChangelogEntry[] }[] {
  const months: { key: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else months.push({ key, entries: [entry] });
  }
  return months;
}
