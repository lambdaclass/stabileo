import { publicI18n } from '../../lib/i18n/store.svelte';
import type { Locale } from '../../lib/i18n/offered';

const en = {
  title: 'Games',
  metaTitle: 'Structural analysis games for students',
  description: 'Free browser games for structural analysis students: practice reading internal force diagrams against the clock, from simple beams to frames and trusses.',
  lead: 'Short games that train the eye for how structures behave. They run in your browser, free, on the same engine as Stabileo.',
  play: 'Play',
};

type Key = keyof typeof en;

export const hubStrings: Record<Locale, Record<Key, string>> = {
  en,
  es: {
    title: 'Juegos',
    metaTitle: 'Juegos de análisis estructural para estudiantes',
    description: 'Juegos gratuitos en el navegador para estudiantes de estructuras: practicá la lectura de diagramas de esfuerzos contra reloj, desde vigas simples hasta pórticos y reticulados.',
    lead: 'Juegos cortos para entrenar el ojo en el comportamiento de las estructuras. Corren en tu navegador, gratis, con el mismo motor de cálculo de Stabileo.',
    play: 'Jugar',
  },
  pt: {
    title: 'Jogos',
    metaTitle: 'Jogos de análise estrutural para estudantes',
    description: 'Jogos gratuitos no navegador para estudantes de estruturas: pratique a leitura de diagramas de esforços contra o relógio, de vigas simples a pórticos e treliças.',
    lead: 'Jogos curtos para treinar o olhar sobre o comportamento das estruturas. Rodam no seu navegador, de graça, com o mesmo motor de cálculo do Stabileo.',
    play: 'Jogar',
  },
  de: {
    title: 'Spiele',
    metaTitle: 'Baustatik-Spiele für Studierende',
    description: 'Kostenlose Browserspiele für Studierende der Baustatik: Üben Sie das Lesen von Schnittgrößenverläufen gegen die Uhr, von einfachen Balken bis zu Rahmen und Fachwerken.',
    lead: 'Kurze Spiele, die den Blick für das Tragverhalten schärfen. Sie laufen kostenlos in Ihrem Browser, mit demselben Rechenkern wie Stabileo.',
    play: 'Spielen',
  },
  fr: {
    title: 'Jeux',
    metaTitle: 'Jeux de calcul des structures pour étudiants',
    description: 'Jeux gratuits dans le navigateur pour les étudiants en structures : entraînez-vous à lire les diagrammes d’efforts contre la montre, des poutres simples aux portiques et aux treillis.',
    lead: 'Des jeux courts pour exercer l’œil au comportement des structures. Ils tournent gratuitement dans votre navigateur, avec le même moteur de calcul que Stabileo.',
    play: 'Jouer',
  },
  tr: {
    title: 'Oyunlar',
    metaTitle: 'Öğrenciler için yapı statiği oyunları',
    description: 'Yapı statiği öğrencileri için ücretsiz tarayıcı oyunları: iç kuvvet diyagramlarını okumayı zamana karşı çalışın; basit kirişlerden çerçevelere ve kafes sistemlere kadar.',
    lead: 'Yapıların davranışına göz alıştırmak için kısa oyunlar. Tarayıcınızda ücretsiz çalışır ve Stabileo ile aynı hesap motorunu kullanır.',
    play: 'Oynayın',
  },
  hu: {
    title: 'Játékok',
    metaTitle: 'Szerkezettani játékok hallgatóknak',
    description: 'Ingyenes böngészős játékok szerkezettan-hallgatóknak: gyakorolja az igénybevételi ábrák olvasását az idő ellen, egyszerű gerendáktól keretekig és rácsos tartókig.',
    lead: 'Rövid játékok, amelyek a szerkezetek viselkedésére élesítik a szemet. Ingyen futnak a böngészőjében, a Stabileo számítómotorjával.',
    play: 'Játsszon',
  },
  ru: {
  title: 'Игры',
  metaTitle: 'Игры по строительной механике для студентов',
  description: 'Бесплатные браузерные игры для студентов, изучающих строительную механику: тренируйтесь читать эпюры внутренних усилий на время, от простых балок до рам и ферм.',
  lead: 'Короткие игры, которые тренируют глаз и помогают понять, как ведут себя конструкции. Они работают в браузере, бесплатно, на том же ядре расчёта, что и Stabileo.',
  play: 'Играть',
},
  zh: {
    title: '游戏',
    metaTitle: '面向学生的结构分析游戏',
    description: '面向结构专业学生的免费浏览器游戏：在限时内练习识读内力图，从简单的梁开始，逐步过渡到框架和桁架，使用与 Stabileo 相同的计算引擎。',
    lead: '训练结构受力直觉的小游戏。它们在你的浏览器中免费运行，使用与 Stabileo 相同的计算引擎。',
    play: '开始游戏',
  },
};

export function th(key: Key): string {
  return (hubStrings[publicI18n.locale as Locale] ?? en)[key];
}
