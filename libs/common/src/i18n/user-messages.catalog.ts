import viMessages from './locales/vi.json';
import enMessages from './locales/en.json';

export type SupportedLanguage = 'vi' | 'en' | string;
export const DEFAULT_LANGUAGE: SupportedLanguage = 'vi';

export interface LocaleCatalog {
  [key: string]: string;
}

/**
 * Registry of localized message dictionaries loaded from standalone JSON locale files.
 * Can be dynamically extended with new languages (e.g. ja, fr, de, es) without modifying application code.
 */
const LOCALES: Record<string, LocaleCatalog> = {
  vi: viMessages as LocaleCatalog,
  en: enMessages as LocaleCatalog,
};

/**
 * Registers or merges a message dictionary for a specific language code.
 * Enables zero-code-change plugin/file extension for future languages.
 *
 * @param language ISO language code (e.g., 'vi', 'en', 'ja', 'fr')
 * @param messages Key-value map of message identifier to localized string
 */
export function registerLocale(language: string, messages: LocaleCatalog): void {
  const normalizedLang = language.toLowerCase();
  LOCALES[normalizedLang] = {
    ...(LOCALES[normalizedLang] || {}),
    ...messages,
  };
}

/**
 * Retrieves the full dictionary for a specified language.
 */
export function getLocaleCatalog(language: string): LocaleCatalog {
  const normalizedLang = language.toLowerCase();
  return LOCALES[normalizedLang] || LOCALES[DEFAULT_LANGUAGE] || LOCALES['vi'];
}

/**
 * Resolves localized message for end-users by key.
 *
 * NOTE: Technical logs, stack traces, and internal errors for developers remain strictly in English.
 * User-facing messages returned in API response bodies are localized according to the client language.
 *
 * @param key ErrorCode or Message identifier
 * @param lang Preferred language ('vi', 'en', etc.)
 * @param fallbackMessage Fallback text if key is not found in the locale dictionary
 */
export function getUserMessage(
  key: string,
  lang: string = DEFAULT_LANGUAGE,
  fallbackMessage?: string,
): string {
  const normalizedLang = (lang || DEFAULT_LANGUAGE).toLowerCase();
  const catalog = LOCALES[normalizedLang] || LOCALES[DEFAULT_LANGUAGE] || LOCALES['vi'];

  if (catalog && catalog[key]) {
    return catalog[key];
  }

  // Fallback to English dictionary if not found in requested language
  if (LOCALES['en'] && LOCALES['en'][key]) {
    return LOCALES['en'][key];
  }

  return fallbackMessage || key;
}
