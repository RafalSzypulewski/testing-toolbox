// To add a tool: create js/tools/<name>.js exporting a default tool object, then list it here.
import counterString from './tools/counterString.js';
import randomString from './tools/randomString.js';
import naughtyStrings from './tools/naughtyStrings.js';
import testData from './tools/testData.js';
import textInspector from './tools/textInspector.js';
import jsonFormatter from './tools/jsonFormatter.js';
import encoder from './tools/encoder.js';
import jwtDecoder from './tools/jwtDecoder.js';
import timestamp from './tools/timestamp.js';
import regexTester from './tools/regexTester.js';

/**
 * Tool shape:
 * { id, name, category, description, keywords?: string[], render(root: HTMLElement): void | (() => void) }
 * render may return a cleanup function (called when the user navigates away).
 */
export const tools = [counterString, randomString, naughtyStrings, testData, textInspector, jsonFormatter, encoder, jwtDecoder, timestamp, regexTester];
