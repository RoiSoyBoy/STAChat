# New_Chat_Bot

## 🚀 Overview

A modern, business-agnostic chatbot platform built with Next.js 14 (App Router), TypeScript, Firebase, and OpenAI. The system supports:
- **Automatic extraction of Q&A pairs** from any business website or uploaded file using generic, language-aware patterns (address, phone, email, hours, etc.).
- **Retrieval-Augmented Generation (RAG)**: The chat API always answers based only on the extracted Q&A pairs from your uploaded data. If no answer is found, the bot will say so.
- **Admin dashboard** for uploading URLs/files, managing settings, and viewing all training data in one place.
- **Extensible and privacy-focused**: No business-specific logic, no backend secrets exposed, and easy to add new Q&A patterns.

---

## 🗂️ Project Structure

```
NewChatBot/
├── .firebase/           # Firebase deployment artifacts and cache
├── .next/               # Next.js build output (local dev/build)
├── cypress/             # Cypress end-to-end tests
├── pages/               # Legacy Next.js pages/api (migrating to app/)
├── public/              # Public static assets (uploads, logos, etc.)
├── src/                 # Main source code
│   ├── __tests__/       # Unit and integration tests
│   ├── app/             # Next.js App Router (main application)
│   │   ├── admin/       # Admin dashboard UI and logic
│   │   ├── api/         # API routes (chat, upload, settings, etc.)
│   │   └── test/        # Test page and related components
│   ├── components/      # Reusable React components (chat widget, admin, etc.)
│   ├── lib/             # Utility libraries (Q&A extraction, validation, etc.)
│   └── types/           # TypeScript type definitions
├── .env.local           # Local environment variables
├── README.md            # Project documentation (you're here!)
└── ...                  # Config, scripts, and other project files
```

---

## ⚙️ How It Works

### 1. **Q&A Extraction (Business-Agnostic)**
- When you upload a URL or file, the backend extracts all visible text.
- The system uses **generic regex patterns** to identify common business information:
  - כתובת (address)
  - טלפון (phone)
  - מייל (email)
  - שעות פתיחה (opening hours)
  - אתר אינטרנט (website)
  - וואטסאפ, פייסבוק, אינסטגרם (social links)
  - משלוחים, חניה, נגישות, דרושים, זכיינות, אודות ועוד
- For each match, a Q&A pair is generated (e.g., "מה הטלפון?" → "03-1234567").
- All Q&A pairs are saved to Firestore and used for chat answers.

### 2. **Chat API (RAG)**
- When a user asks a question, the API searches all Q&A pairs for relevant matches (using keyword search).
- Only the most relevant Q&A pairs are sent as context to the LLM (OpenAI), with a strict prompt: "Answer ONLY from the following Q&A. If you don't know, say so."
- If no answer is found, the bot responds: "אין לי תשובה לשאלה זו על פי המידע שסיפקת."
- No business-specific logic or backend secrets are ever exposed.

### 3. **Admin Dashboard**
- Upload URLs or files for training (all data is processed for Q&A extraction).
- See all uploaded URLs and their extracted data, regardless of session or user.
- Real-time feedback, error handling, and loading states for a smooth admin experience.

---

## 🧩 Extensibility & Contributing

### Adding New Q&A Patterns
- To support more business types or info, add new regex patterns and Q&A logic in `src/lib/preprocess.ts`.
- Patterns should be generic and not tied to any specific business.
- PRs for new patterns, languages, or business verticals are welcome!

### Privacy & Security
- The system never exposes backend-only data or secrets.
- All Q&A is generated only from uploaded/public data.

### Testing & Development
- Run `npm run dev` for local development.
- Use the admin dashboard to upload new data and test chat responses.
- All code is TypeScript, tested with Jest and Cypress.

---

## 📝 Notes
- All UI is RTL-friendly, modern, and responsive (TailwindCSS).
- The chat widget is embeddable and floats at the bottom right.
- Admin dashboard allows real-time settings updates (color, logo, greeting, training data).
- All backend logic is handled via Next.js API routes, with Firebase for storage and authentication.
- Environment variables and secrets are managed via `.env.local`.

---

## 👥 Contributing

1. Fork the repo and create a feature branch.
2. Add or improve Q&A extraction patterns in `src/lib/preprocess.ts`.
3. Test your changes locally (see Testing & Development above).
4. Open a PR with a clear description of your changes and why they're useful for generic business chatbots.

---

## 📣 Contact & Support
For questions, feature requests, or support, open an issue or contact the maintainers.

# NewChatBot Platform

## Folder Structure (2024 Refactor)

```
src/
  ingestion/
    pdf/                # PDF ingestion logic (handlers, helpers)
    web/                # Web ingestion logic (handlers, helpers)
    shared/             # Shared utilities: chunkText, embedding, tagging
      chunkText.ts
      embedding.ts
      classifyTagsWithOpenAI.ts
  chat/                 # Chat logic, prompt helpers, memory
    prompt/
  components/           # React components (admin, chat, etc.)
  __tests__/            # Unit and integration tests
  api/                  # API routes (import from above)
  archive/              # Archived legacy endpoints/components
```

## Canonical Flows
- **Ingestion:**
  - `/api/upload/pdf` for PDF documents
  - `/api/fetch-url` for web URLs (now includes Q&A extraction)
  - Both use shared chunking, embedding, and tagging utilities
- **Chat:**
  - `/api/chat` is the canonical RAG-enabled chat endpoint
  - Uses context from Pinecone, citations, and settings

## Shared Utilities
- `src/ingestion/shared/chunkText.ts` — text chunking
- `src/ingestion/shared/embedding.ts` — OpenAI embeddings
- `src/ingestion/shared/classifyTagsWithOpenAI.ts` — tag classification

## Archived/Legacy Code
- See `src/app/api/archive/` and `src/components/archive/` for old endpoints/components

## Running Tests
- All tests are in `src/__tests__/`
- Run with: `npm test` or `yarn test`
- Critical logic (chunking, embedding, tagging, chat) is covered

## Contributing
See `CONTRIBUTING.md` for guidelines on adding new features, using shared utilities, and safely archiving code.
