// Word counting and limit messages for the journal. Pure functions, so they
// are tested in Node and shared by the view.

import { JOURNAL_MAX_CHARS } from './inputs.js';

const WARN_AT = 0.8; // show "words left" past 80% of the limit


export function wordCount(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

export const fmtNum = (n) => n.toLocaleString('en-US');

/** Status of the draft against the limit, in words people understand. */
export function draftStatus(text) {
  const chars = text.length;
  const words = wordCount(text);
  const charsPerWord = words ? chars / words : 6;
  const wordsFor = (c) => Math.max(1, Math.round(c / charsPerWord));
  if (chars > JOURNAL_MAX_CHARS) {
    return {
      tone: 'over',
      words,
      text: `${fmtNum(words)} words. About ${fmtNum(wordsFor(chars - JOURNAL_MAX_CHARS))} words over the limit. Shorten it or split it into two entries; nothing has been cut.`,
    };
  }
  if (chars >= JOURNAL_MAX_CHARS * WARN_AT) {
    return { tone: 'warn', words, text: `${fmtNum(words)} words. About ${fmtNum(wordsFor(JOURNAL_MAX_CHARS - chars))} words left.` };
  }
  return { tone: '', words, text: words ? `${fmtNum(words)} ${words === 1 ? 'word' : 'words'}` : '' };
}

