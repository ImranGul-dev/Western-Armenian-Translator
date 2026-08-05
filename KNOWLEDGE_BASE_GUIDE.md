# Western Armenian Knowledge Base

## Tables

### `glossary_terms`
Stores words and multi-word phrases, language direction, target term, definition, examples, source, copyright status and commercial-use permission.

### `grammar_rules`
Stores rule descriptions, categories, keywords, correct/incorrect examples, exceptions, source and licensing data.

### `approved_translation_examples`
Stores expert-reviewed sentence pairs for supported language directions.

## Approval rule

Only entries with `approved=true` are eligible. Glossary and grammar records must also have `commercial_use_allowed=true`. Unapproved content is visible only to authorized editors/admins and is never sent to OpenAI as authoritative context.

## Retrieval

The `find_translation_context` database function:

1. normalizes Unicode text;
2. ranks exact phrase matches before individual word matches;
3. filters by language pair and approval;
4. retrieves keyword-relevant grammar rules;
5. retrieves a small number of similar sentence examples;
6. limits results before the Edge Function builds the prompt.

The complete dictionary is never sent with every request. This reduces cost, latency and prompt confusion and makes later vector-search upgrades possible without replacing the translator UI.

## Import

Templates are in `knowledge-base-templates/`. In the admin dashboard open Glossary, Grammar or Examples and choose **Import CSV/JSON**. Imported rows are forced to `approved=false` for review.

CSV must use the template headers. JSON must contain an array of row objects.

## Copyright warning

Only import language resources that TunApp owns or has permission to use commercially. Do not scrape or copy a complete dictionary, course or textbook merely because it is publicly viewable online. Record the source, copyright status and permission.
