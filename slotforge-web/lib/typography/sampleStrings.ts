// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Typography sample strings (per locale × per role)
//
// Each locale supplies the same six strings — title, subtitle, cta, body,
// numeric, smallLabel — so the TypographyWorkspace preview and the
// downloaded standalone HTML can render a realistic before-and-after
// for the generated spec in any supported language.
//
// Numerics use locale-appropriate formatting (1.250,00 € in EU vs
// 1,250.00 USD) so the numeric style's kerning/letter-spacing looks
// right for each market. Currency glyphs (€ ₺ R$ zł ₽) are included
// so bitmap-atlas-based pipelines can see exactly which ligatures
// they need to bake.
//
// To add a locale:
//   1. Add its entry to SAMPLE_STRINGS here
//   2. Add its label to LOCALE_LABELS
//   3. Add its code to the TypographyLocale union in types/typography.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { TypographyLocale } from '@/types/typography'

export interface SampleStringSet {
  title:      string
  subtitle:   string
  cta:        string
  body:       string
  numeric:    string
  smallLabel: string
}

export const SAMPLE_STRINGS: Record<TypographyLocale, SampleStringSet> = {
  en: { title: 'Congratulations!',      subtitle: 'You Are Entering Bonus Game!',           cta: 'Press Anywhere to Continue',
        body:  'Collect 3 gold stars to unlock the bonus round.',
        numeric: '$1,250.00',           smallLabel: 'Total Bet · Round 3 of 10' },

  es: { title: '¡Enhorabuena!',         subtitle: '¡Accediendo al Juego de Bonus!',         cta: 'Pulsa en Cualquier Parte para Continuar',
        body:  'Consigue 3 estrellas doradas para desbloquear la ronda de bonus.',
        numeric: '1.250,00 €',          smallLabel: 'Apuesta Total · Ronda 3 de 10' },

  tr: { title: 'Tebrikler!',            subtitle: 'Bonus Oyuna Giriyorsunuz!',              cta: 'Devam Etmek İçin Herhangi Bir Yere Dokunun',
        body:  'Bonus turunu açmak için 3 altın yıldız toplayın.',
        numeric: '1.250,00 ₺',          smallLabel: 'Toplam Bahis · Tur 3 / 10' },

  pt: { title: 'Parabéns!',             subtitle: 'Você Está Entrando no Jogo Bônus!',      cta: 'Pressione Qualquer Lugar para Continuar',
        body:  'Colete 3 estrelas douradas para desbloquear a rodada bônus.',
        numeric: 'R$ 1.250,00',         smallLabel: 'Aposta Total · Rodada 3 de 10' },

  de: { title: 'Glückwunsch!',          subtitle: 'Sie Betreten das Bonusspiel!',           cta: 'Drücken Sie Irgendwo zum Fortfahren',
        body:  'Sammle 3 goldene Sterne, um die Bonusrunde freizuschalten.',
        numeric: '1.250,00 €',          smallLabel: 'Gesamteinsatz · Runde 3 von 10' },

  fr: { title: 'Félicitations !',       subtitle: 'Vous Entrez dans le Jeu Bonus !',        cta: 'Appuyez Partout pour Continuer',
        body:  'Collectez 3 étoiles dorées pour débloquer le tour bonus.',
        numeric: '1 250,00 €',          smallLabel: 'Mise Totale · Tour 3 sur 10' },

  it: { title: 'Congratulazioni!',      subtitle: 'Stai Entrando nel Gioco Bonus!',         cta: 'Premi Ovunque per Continuare',
        body:  'Raccogli 3 stelle dorate per sbloccare il round bonus.',
        numeric: '€ 1.250,00',          smallLabel: 'Puntata Totale · Round 3 di 10' },

  pl: { title: 'Gratulacje!',           subtitle: 'Wchodzisz do Gry Bonusowej!',            cta: 'Naciśnij Gdziekolwiek, Aby Kontynuować',
        body:  'Zbierz 3 złote gwiazdki, aby odblokować rundę bonusową.',
        numeric: '1 250,00 zł',         smallLabel: 'Całkowita Stawka · Runda 3 z 10' },

  ru: { title: 'Поздравляем!',          subtitle: 'Вы Входите в Бонусную Игру!',            cta: 'Нажмите в Любом Месте, Чтобы Продолжить',
        body:  'Соберите 3 золотые звезды, чтобы открыть бонусный раунд.',
        numeric: '1 250,00 ₽',          smallLabel: 'Общая Ставка · Раунд 3 из 10' },
}

export const LOCALE_LABELS: Record<TypographyLocale, string> = {
  en: 'English',   es: 'Español',  tr: 'Türkçe',
  pt: 'Português', de: 'Deutsch',  fr: 'Français',
  it: 'Italiano',  pl: 'Polski',   ru: 'Русский',
}

/** Ordered list used by the workspace chip picker — keeps the row
 *  stable across renders. */
export const SUPPORTED_LOCALES: TypographyLocale[] = [
  'en', 'es', 'tr', 'pt', 'de', 'fr', 'it', 'pl', 'ru',
]

/** Apply a spec's `case` setting to a string, respecting Turkish dotted-i
 *  rules when the locale is 'tr'. Default JS toUpperCase('i') produces
 *  'I'; Turkish requires 'İ', and lowercase('I') → 'ı' (dotless). */
export function applyCase(
  text:     string,
  caseType: 'upper' | 'lower' | 'sentence' | 'asis' | undefined,
  locale:   TypographyLocale
): string {
  if (caseType === 'upper') return locale === 'tr' ? text.toLocaleUpperCase('tr-TR') : text.toUpperCase()
  if (caseType === 'lower') return locale === 'tr' ? text.toLocaleLowerCase('tr-TR') : text.toLowerCase()
  return text
}
