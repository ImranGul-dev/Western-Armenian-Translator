import assert from "node:assert/strict";
import { transliterateWesternArmenian } from "../src/lib/western-armenian-transliteration.ts";

assert.equal(transliterateWesternArmenian("ես կը սիրեմ"), "yes gë sirem");
assert.equal(transliterateWesternArmenian("Ես կը սիրեմ"), "Yes gë sirem");
assert.equal(transliterateWesternArmenian(""), "");

console.log("Western Armenian transliteration checks passed.");
