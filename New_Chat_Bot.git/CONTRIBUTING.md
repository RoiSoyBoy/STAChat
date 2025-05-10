# Contributing to NewChatBot

## Folder Structure
- **src/ingestion/pdf/** — PDF ingestion logic
- **src/ingestion/web/** — Web ingestion logic
- **src/ingestion/shared/** — Shared utilities (chunkText, embedding, tagging)
- **src/chat/** — Chat logic, prompt helpers
- **src/components/** — React components
- **src/__tests__/** — All tests
- **src/app/api/archive/** — Archived endpoints/components

## Using Shared Utilities
- Always use `chunkText`, `generateEmbeddings`, and `classifyTagsWithOpenAI` from `src/ingestion/shared/` for chunking, embedding, and tagging.
- Do not duplicate this logic in endpoints or components.

## Adding New Ingestion or Chat Features
- Add new ingestion strategies (e.g., DOCX, TXT) as a new folder in `src/ingestion/`.
- Add new chat features in `src/chat/` or as helpers in `src/chat/prompt/`.
- Import shared utilities as needed.
- Update API routes to import from these locations.

## Writing/Updating Tests
- Add or update tests in `src/__tests__/`.
- Cover all new logic, especially for chunking, embedding, tagging, and chat.
- Use mocks for external APIs (OpenAI, Firebase) where possible.
- Run tests with `npm test` or `yarn test` before submitting changes.

## Archiving Legacy Code
- Move unused or superseded endpoints/components to `src/app/api/archive/` or `src/components/archive/`.
- Do not delete immediately; keep for 1-2 release cycles.
- Add a TODO comment with the reason for archival and the date.

## Code Review & PRs
- Ensure all tests pass before requesting review.
- Add clear comments and summaries for new modules.
- Reference this guide in your PR description. 