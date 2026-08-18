import assert from "node:assert/strict";
import { transliterateWesternArmenian } from "../src/lib/western-armenian-transliteration.ts";
import { latinToWesternArmenian } from "../src/lib/western-armenian-input.ts";

assert.equal(transliterateWesternArmenian("ես կը սիրեմ"), "yes gë sirem");
assert.equal(transliterateWesternArmenian("Ես կը սիրեմ"), "Yes gë sirem");
assert.equal(transliterateWesternArmenian("բարեւ, ես լաւ եմ"), "parev, es lav yem");
assert.equal(transliterateWesternArmenian("բարեւ։ ես լաւ եմ"), "parev։ yes lav yem");
assert.equal(transliterateWesternArmenian("եկեղեցի"), "yegeghetsi");
assert.equal(transliterateWesternArmenian("մեր"), "mer");
assert.equal(transliterateWesternArmenian("որ"), "vor");
assert.equal(transliterateWesternArmenian("սովոր"), "sovor");
assert.equal(transliterateWesternArmenian(""), "");

// Client-requested Latin-input convention: x represents Armenian խ.
assert.equal(latinToWesternArmenian("x"), "խ");
assert.equal(latinToWesternArmenian("X"), "Խ");

console.log("Western Armenian transliteration checks passed.");
