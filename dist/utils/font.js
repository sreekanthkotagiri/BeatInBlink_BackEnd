"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFont = void 0;
const detectFont = (text) => {
    if (/[ఁ-౿]/.test(text))
        return 'telugu'; // Telugu
    if (/[ऀ-ॿ]/.test(text))
        return 'devanagari'; // Hindi, Marathi, Sanskrit
    if (/[\u0B80-\u0BFF]/.test(text))
        return 'tamil'; // Tamil
    if (/[\u0C80-\u0CFF]/.test(text))
        return 'kannada'; // Kannada
    if (/[\u0D00-\u0D7F]/.test(text))
        return 'malayalam'; // Malayalam
    if (/[\u0980-\u09FF]/.test(text))
        return 'bengali'; // Bengali, Assamese
    if (/[\u0A80-\u0AFF]/.test(text))
        return 'gujarati'; // Gujarati
    if (/[\u0A00-\u0A7F]/.test(text))
        return 'gurmukhi'; // Punjabi (Gurmukhi)
    if (/[\u1100-\u11FF]/.test(text))
        return 'korean'; // Hangul Jamo
    if (/[\u3040-\u309F]/.test(text))
        return 'japanese'; // Hiragana
    if (/[\u30A0-\u30FF]/.test(text))
        return 'japanese'; // Katakana
    if (/[\u4E00-\u9FFF]/.test(text))
        return 'chinese'; // CJK Unified Ideographs
    if (/[\u0600-\u06FF]/.test(text))
        return 'arabic'; // Arabic
    if (/[\u0400-\u04FF]/.test(text))
        return 'cyrillic'; // Russian, Ukrainian, etc.
    if (/[\u0100-\u024F]/.test(text))
        return 'latin_extended'; // European Latin (Polish, Czech, etc.)
    return 'default'; // Basic Latin
};
exports.detectFont = detectFont;
