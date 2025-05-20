  # New_Chat_Bot

  ## 🚀 Overview

  A modern, business-agnostic chatbot platform built with Next.js 14 (App Router), TypeScript, Firebase, and OpenAI. The system supports:
  - **Automatic extraction of Q&A pairs** from any business website or uploaded file using generic, language-aware patterns (address, phone, email, hours, etc.).
  - **Retrieval-Augmented Generation (RAG)**: The chat API answers based on the extracted Q&A pairs from your uploaded data. If no answer is found, the bot will say so.
  - **Admin dashboard** for uploading URLs/files, managing settings, and viewing training data.
  - **Extensible and privacy-focused**: No business-specific logic, no backend secrets exposed, and easy to add new Q&A patterns.

  ---

  ## 🗂️ Project Structure

  ```
  NewChatBot/
  ├── .firebaserc          # Firebase project configuration
  ├── .next/               # Next.js build output (typically gitignored)
  ├── cypress/             # Cypress end-to-end tests
  │   ├── e2e/             # E2E test specifications (e.g., chat.cy.ts)
  │   └── support/         # Cypress support files (commands.ts, e2e.ts)
  ├── pages/               # Legacy Next.js pages (e.g., pages/api/ingest.ts)
  ├── public/              # Public static assets
  │   ├── uploads/         # User-uploaded files (e.g., images, documents)
  │   ├── file.svg         # SVG icons
  │   ├── globe.svg
  │   ├── index.html       # Placeholder HTML (potentially for Firebase Hosting)
  │   ├── next.svg
  │   ├── vercel.svg
  │   ├── widget.js        # Embeddable chat widget script
  │   └── window.svg
  ├── src/                 # Main source code
  │   ├── __tests__/       # Unit and integration tests (Jest)
  │   ├── app/             # Next.js App Router (main application UI and API)
  │   │   ├── admin/       # Admin dashboard (page.tsx, layout.tsx, IngestUrlButton.tsx)
  │   │   ├── api/         # API routes (App Router)
  │   │   │   ├── archive/ # Archived API endpoints (answer.route.ts, etc.)
  │   │   │   ├── chat/    # Main chat API (route.ts)
  │   │   │   ├── fetch-url/ # Fetch URL for ingestion API (route.ts)
  │   │   │   ├── generate-embed/ # Embedding generation API (route.ts)
  │   │   │   ├── messages/ # Messages API (route.ts)
  │   │   │   ├── process-training-data/ # Training data processing API (route.ts)
  │   │   │   ├── settings/ # Settings management API (route.ts)
  │   │   │   ├── sse/     # Server-Sent Events API (route.ts)
  │   │   │   └── upload/  # File upload API (route.ts, pdf/route.ts)
  │   │   ├── (root files) # Root app files (layout.tsx, page.tsx, globals.css, error.tsx)
  │   │   ├── sse/         # SSE test page UI (page.tsx)
  │   │   └── test/        # General test page UI (page.tsx, layout.tsx)
  │   ├── chat/            # Core chat-related logic
  │   │   └── prompt/      # Prompt engineering templates and helpers
  │   ├── components/      # Reusable React components
  │   │   ├── admin/       # Admin-specific components (Card.tsx, FileUpload.tsx, SettingsForm.tsx)
  │   │   ├── archive/     # Archived UI components
  │   │   ├── ChatWidget/  # Main chat widget UI and logic
  │   │   ├── TestChatWidget/ # Test chat widget components
  │   │   └── ...          # Other shared components (ClientRoot.tsx, RootLayoutClient.tsx)
  │   ├── ingestion/       # Data ingestion and processing logic
  │   │   ├── pdf/         # PDF specific ingestion logic
  │   │   ├── shared/      # Shared utilities (chunkText.ts, embedding.ts, classifyTagsWithOpenAI.ts)
  │   │   └── web/         # Web/URL specific ingestion logic
  │   ├── lib/             # Core libraries, utilities, and business logic
  │   │   ├── firebase.ts  # Firebase setup and core utilities
  │   │   ├── firecrawl.ts # Firecrawl integration for web scraping
  │   │   ├── preprocess.ts# Q&A and text preprocessing logic
  │   │   ├── rag.ts       # Retrieval-Augmented Generation logic
  │   │   ├── SettingsContext.tsx # React context for settings
  │   │   └── ...          # Other utilities (validation, context, cache, etc.)
  │   └── types/           # TypeScript type definitions (e.g., for external libraries)
  ├── .env.local           # Local environment variables (gitignored)
  ├── CONTRIBUTING.md      # Contribution guidelines
  ├── firebase.json        # Firebase configuration (hosting, functions, firestore rules, etc.)
  ├── jest.config.js       # Jest test runner configuration
  ├── next.config.js       # Next.js project configuration
  ├── package.json         # Project dependencies and NPM scripts
  ├── README.md            # Project documentation (this file)
  ├── tailwind.config.js   # TailwindCSS configuration
  ├── tsconfig.json        # TypeScript compiler configuration
  └── ...                  # Other config files (ESLint, PostCSS, .gitignore, etc.)
  ```

  ---

  ## ⚙️ How It Works

  ### 1. **Data Ingestion & Q&A Extraction**
  - **Sources**: URLs (via `src/app/api/fetch-url/route.ts`) or Files (PDFs via `src/app/api/upload/pdf/route.ts`).
  - **Content Extraction**: Uses tools like Firecrawl (`src/lib/firecrawl.ts`) for web content.
  - **Preprocessing**: Text is processed using `src/lib/preprocess.ts` and chunked using `src/ingestion/shared/chunkText.ts`.
  - **Q&A Generation**: Generic regex patterns identify common business information (address, phone, email, hours, etc.) to create Q&A pairs.
  - **Embeddings**: Text chunks and/or Q&A pairs are converted into vector embeddings using `src/ingestion/shared/embedding.ts` (e.g., with OpenAI).
  - **Storage**: Q&A pairs, embeddings, and source data are typically stored in Firestore and a vector database (e.g., Pinecone).

  ### 2. **Chat API (RAG)**
  - **Endpoint**: `src/app/api/chat/route.ts`
  - **Context Retrieval**: When a user asks a question, the API performs a vector search (e.g., `src/lib/vectorSearch.ts` or `src/lib/generateContextFromPinecone.ts`) on the stored embeddings to find relevant information.
  - **Prompt Engineering**: The retrieved context is combined with the user's question and a carefully crafted prompt (see `src/chat/prompt/` and `src/lib/buildPrompt.ts`).
  - **LLM Interaction**: The combined prompt is sent to an LLM (e.g., OpenAI) with instructions to answer *only* from the provided context.
  - **Response**: If relevant information is found, the LLM generates an answer. Otherwise, the bot indicates it doesn't have the answer based on the provided data.

  ### 3. **Admin Dashboard**
  - **Location**: `src/app/admin/`
  - **Functionality**: Allows users to upload URLs/files for training, manage application settings (e.g., appearance, model parameters), and view ingested data.
  - **Real-time Updates**: Provides feedback on ingestion processes, error handling, and loading states.

  ---

  ## 🛠️ Key Shared Utilities & Modules

  - **Text Chunking**: `src/ingestion/shared/chunkText.ts`
  - **Embeddings Generation**: `src/ingestion/shared/embedding.ts` (utilizing OpenAI)
  - **Tag Classification**: `src/ingestion/shared/classifyTagsWithOpenAI.ts` (for categorizing content)
  - **Q&A Preprocessing**: `src/lib/preprocess.ts`
  - **RAG Core Logic**: `src/lib/rag.ts`
  - **Web Scraping**: `src/lib/firecrawl.ts`
  - **Firebase Integration**: `src/lib/firebase.ts`, `src/lib/firebase-admin.ts`

  ---

  ## 🗄️ Archived & Legacy Code

  - **API Endpoints**: `src/app/api/archive/`
  - **Components**: `src/components/archive/`
  - **Pages**: The `pages/` directory (e.g., `pages/api/ingest.ts`) contains older Next.js pages/api routes.

  ---

  ## 🧩 Extensibility

  ### Adding New Q&A Patterns
  - Modify regex patterns and Q&A generation logic in `src/lib/preprocess.ts`.
  - Ensure patterns are generic and not business-specific.

  ### Privacy & Security
  - The system is designed to avoid exposing backend-only data or secrets.
  - Q&A generation relies solely on the data provided through uploads or public URLs.

  ---

  ## 🧪 Testing & Development

  ### Running the Development Server
  - Execute `npm run dev` to start the Next.js development server.
  - Access the application locally (typically `http://localhost:3000`).
  - Use the admin dashboard to upload data and test chat responses.

  ### Running Tests
  - **Unit/Integration Tests (Jest)**:
    - Test files are located in `src/__tests__/`.
    - Run with `npm test` or `yarn test`.
    - Critical logic (chunking, embedding, tagging, chat, API endpoints) should be covered.
  - **End-to-End Tests (Cypress)**:
    - Test files are in `cypress/e2e/`.
    - Configuration in `cypress.config.ts`.
    - Run with a script like `npm run cypress:open` or `npm run cypress:run` (check `package.json` for specific scripts).

  ---

  ## 📝 Notes
  - UI is RTL-friendly, modern, and responsive, built with TailwindCSS.
  - The chat widget is designed to be embeddable.
  - Admin dashboard allows real-time settings updates.
  - Backend logic is primarily handled via Next.js App Router API routes.
  - Firebase is used for data storage (Firestore), and potentially authentication and hosting.
  - Environment variables are managed via `.env.local` (ensure this file is in `.gitignore`).

  ---

  ## 👥 Contributing
  Please refer to `CONTRIBUTING.md` for detailed guidelines on:
  - Setting up the development environment.
  - Coding standards and practices.
  - Adding new features or Q&A patterns.
  - Using shared utilities.
  - Safely archiving or refactoring code.
  - Submitting pull requests.

  ---

  ## 📣 Contact & Support
  For questions, feature requests, or support, please open an issue on the project's GitHub repository or contact the maintainers.
