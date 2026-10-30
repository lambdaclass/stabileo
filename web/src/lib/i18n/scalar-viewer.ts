import { i18n } from './store.svelte';
const keyboard: Record<string, string> = {
  "en": "Arrow keys pan; Shift + arrows orbit; + and − zoom; Home fits the model.",
  "es": "Las flechas desplazan; Mayús + flechas orbitan; + y − amplían; Inicio encuadra el modelo.",
  "pt": "As setas deslocam; Shift + setas orbitam; + e − ampliam; Home enquadra o modelo.",
  "de": "Pfeiltasten verschieben; Umschalt + Pfeile drehen; + und − zoomen; Pos1 passt das Modell ein.",
  "fr": "Les flèches déplacent ; Maj + flèches tournent ; + et − zooment ; Début cadre le modèle.",
  "tr": "Ok tuşları kaydırır; Shift + oklar döndürür; + ve − yakınlaştırır; Home modeli sığdırır."
};
export const keyboardInstructions = () => keyboard[i18n.locale] ?? keyboard.en;
