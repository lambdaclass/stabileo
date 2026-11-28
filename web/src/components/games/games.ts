import type { Component } from 'svelte';
import type { Locale } from '../../lib/i18n/offered';
import type { GameId } from '../../lib/game-routes';
import DiagramGameThumb from './DiagramGameThumb.svelte';

export type GameCard = { id: GameId; thumb: Component; copy: Record<Locale, { title: string; description: string }> };

/** The hub's cards, in order. The title is the game page's own h1. */
export const GAMES: readonly GameCard[] = [
  {
    id: 'diagram-game',
    thumb: DiagramGameThumb,
    copy: {
      en: { title: 'Pick the right diagram', description: 'A structure, its loads and three or four diagrams: pick the right one before the clock runs down. It starts with simple beams and works up to frames and trusses.' },
      es: { title: 'Diagramas: elegí el correcto', description: 'Una estructura, sus cargas y tres o cuatro diagramas: elegí el correcto antes de que se acabe el tiempo. Empieza con vigas simples y llega a pórticos y reticulados.' },
      pt: { title: 'Diagramas: escolha o correto', description: 'Uma estrutura, suas cargas e três ou quatro diagramas: escolha o correto antes que o tempo acabe. Começa com vigas simples e chega a pórticos e treliças.' },
      de: { title: 'Diagramme: Wählen Sie das richtige', description: 'Ein Tragwerk, seine Lasten und drei oder vier Diagramme: Wählen Sie das richtige, bevor die Zeit abläuft. Es beginnt mit einfachen Balken und führt bis zu Rahmen und Fachwerken.' },
      fr: { title: 'Diagrammes : choisissez le bon', description: 'Une structure, ses charges et trois ou quatre diagrammes : choisissez le bon avant la fin du temps. On commence par des poutres simples et on arrive aux portiques et aux treillis.' },
      tr: { title: 'Diyagramlar: doğru olanı seçin', description: 'Bir yapı, yükleri ve üç ya da dört diyagram: süre bitmeden doğru olanı seçin. Basit kirişlerle başlar, çerçevelere ve kafes sistemlere kadar ilerler.' },
      hu: { title: 'Válassza ki a helyes ábrát', description: 'Egy szerkezet, a terhei és három-négy ábra: válassza ki a helyeset, mielőtt lejár az idő. Egyszerű gerendáktól keretekig és rácsos tartókig.' },
      ko: { title: '알맞은 선도 고르기', description: '구조물, 하중, 그리고 세 개 또는 네 개의 선도가 주어집니다. 시간이 다 되기 전에 알맞은 것을 고르세요. 단순보에서 시작해 골조와 트러스까지 단계적으로 어려워집니다.' },
      zh: { title: '哪幅图是正确的？', description: '观察结构及其荷载，在倒计时结束前从三到四个选项中选出正确的内力图或变形图。从简单的梁开始，逐步过渡到框架和桁架。' },
    },
  },
];
