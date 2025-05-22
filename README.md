  # New_Chat_Bot

  ## 🚀 Overview

  A modern, business-agnostic chatbot platform built with Next.js 14 (App Router), TypeScript, Firebase, and OpenAI. The system supports:
  - **Automatic extraction of Q&A pairs** from any business website or uploaded file using generic, language-aware patterns (address, phone, email, hours, etc.).
  - **Retrieval-Augmented Generation (RAG)**: The chat API answers based on the extracted Q&A pairs from your uploaded data. If no answer is found, the bot will say so.
  - **Admin dashboard** for uploading URLs/files, managing settings, and viewing training data.
  - **Extensible and privacy-focused**: No business-specific logic, no backend secrets exposed, and easy to add new Q&A patterns.

  ---

  ## 🗂️ Project Structure

  This project is a monorepo managed with npm workspaces, separating concerns into frontend, backend, and shared packages.

  ```
  NewChatBot/
  ├── apps/
  │   ├── backend/                  # Backend application (e.g., Express.js, NestJS)
  │   │   ├── package.json
  │   │   ├── tsconfig.json
  │   │   ├── src/
  │   │   │   ├── api/              # API routes organized by version and resource
  │   │   │   │   └── v1/
  │   │   │   │       ├── archive/  # Archived API endpoints
  │   │   │   │       ├── chat/     # Chat-related API endpoints
  │   │   │   │       ├── classify-tags/
  │   │   │   │       ├── delete-document/
  │   │   │   │       ├── faqs/
  │   │   │   │       ├── fetch-url/
  │   │   │   │       ├── generate-embed/
  │   │   │   │       ├── ingest-google-sheet/
  │   │   │   │       ├── messages/
  │   │   │   │       ├── process-pdf/
  │   │   │   │       ├── process-training-data/
  │   │   │   │       ├── settings/
  │   │   │   │       ├── sse/
  │   │   │   │       └── upload/   # File upload API (placeholders, needs implementation)
  │   │   │   ├── config/           # Configuration files (e.g., OpenAI client)
  │   │   │   ├── lib/              # Core backend libraries and business logic
  │   │   │   │   ├── ingestion/    # Data ingestion specific logic
  │   │   │   │   └── ...           # (embedding, RAG, Firebase Admin, Firecrawl, etc.)
  │   │   │   ├── middleware/       # Custom Express middleware (auth, tenant context)
  │   │   │   └── server.ts         # Backend server entry point
  │   │   └── ...                   # (scripts, .env, etc.)
  │   └── frontend/                 # Next.js frontend application
  │       ├── package.json
  │       ├── tsconfig.json
  │       ├── next.config.js
  │       ├── public/               # Static assets (images, widget.js)
  │       ├── src/
  │       │   ├── app/              # Next.js App Router (pages, layouts)
  │       │   ├── components/       # Reusable React components
  │       │   ├── lib/              # Frontend-specific libraries (Firebase client, contexts)
  │       │   ├── services/         # API client for frontend-backend communication
  │       │   ├── types/            # Frontend-specific TypeScript definitions
  │       │   └── __tests__/        # Frontend unit/integration tests
  │       └── ...                   # (.env.local, middleware.ts for Next.js, etc.)
  ├── packages/
  │   └── shared/                   # Shared utilities and types
  │       ├── package.json
  │       └── src/
  │           ├── *.types.ts        # Shared TypeScript type definitions
  │           ├── *.ts              # Shared utility functions (e.g., chunkText)
  │           └── __tests__/        # Tests for shared utilities
  ├── cypress/                      # Cypress end-to-end tests
  ├── pages/                        # Legacy Next.js pages (e.g., pages/api/ingest.ts) - Review if still needed
  ├── .firebaserc                   # Firebase project configuration
  ├── firebase.json                 # Firebase configuration (hosting, functions, firestore rules, etc.)
  ├── jest.config.js                # Jest test runner configuration
  ├── package.json                  # Root monorepo package.json (workspaces, global scripts)
  ├── README.md                     # Project documentation (this file)
  ├── tsconfig.json                 # Root TypeScript compiler configuration
  └── ...                           # Other config files (ESLint, PostCSS, .gitignore, etc.)
  ```

  This project has been refactored from a monolithic Next.js application into a more scalable monorepo structure.

  ---

  ## ⚙️ How It Works

  ### 1. **Data Ingestion & Q&A Extraction (Backend)**
  - **Sources**: URLs (via `apps/backend/src/api/v1/fetch-url/`) or Files (PDFs via `apps/backend/src/api/v1/upload/pdf/`).
  - **Content Extraction**: Uses tools like Firecrawl (`apps/backend/src/lib/firecrawl.ts`) for web content.
  - **Preprocessing**: Text is processed using `apps/backend/src/lib/preprocess.ts` and chunked using `packages/shared/src/chunkText.ts`.
  - **Q&A Generation**: Generic regex patterns identify common business information to create Q&A pairs.
  - **Embeddings**: Text chunks and/or Q&A pairs are converted into vector embeddings using `apps/backend/src/lib/embedding.ts` (e.g., with OpenAI).
  - **Storage**: Q&A pairs, embeddings, and source data are typically stored in Firestore and a vector database (e.g., Pinecone), managed by the backend.

  ### 2. **Chat API (RAG) (Backend)**
  - **Endpoint**: `apps/backend/src/api/v1/chat/`
  - **Context Retrieval**: When a user asks a question, the API performs a vector search (e.g., `apps/backend/src/lib/vectorSearch.ts` or `apps/backend/src/lib/generateContextFromPinecone.ts`) on the stored embeddings.
  - **Prompt Engineering**: The retrieved context is combined with the user's question and a carefully crafted prompt (see `apps/backend/src/lib/buildPrompt.ts`).
  - **LLM Interaction**: The combined prompt is sent to an LLM (e.g., OpenAI, configured in `apps/backend/src/config/openai.ts`) with instructions to answer *only* from the provided context.
  - **Response**: If relevant information is found, the LLM generates an answer. Otherwise, the bot indicates it doesn't have the answer based on the provided data.

  ### 3. **Admin Dashboard (Frontend)**
  - **Location**: `apps/frontend/src/app/admin/`
  - **Functionality**: Allows users to upload URLs/files for training (interacting with backend APIs), manage application settings, and view ingested data.
  - **Real-time Updates**: Provides feedback on ingestion processes, error handling, and loading states.

  ---

  ## 🛠️ Key Modules & Locations

  - **Shared Utilities & Types**: `packages/shared/src/`
    - Text Chunking: `packages/shared/src/chunkText.ts`
    - Common Types: `packages/shared/src/types.ts`, `packages/shared/src/chat.types.ts`
  - **Backend Core Logic**: `apps/backend/src/lib/`
    - Embeddings Generation: `apps/backend/src/lib/embedding.ts`
    - Tag Classification: `apps/backend/src/lib/ingestion/classifyTagsWithOpenAI.ts`
    - Q&A Preprocessing: `apps/backend/src/lib/preprocess.ts`
    - RAG Core Logic: `apps/backend/src/lib/rag.ts`
    - Web Scraping: `apps/backend/src/lib/firecrawl.ts`
  - **Firebase Integration**:
    - Client-side: `apps/frontend/src/lib/firebase.ts`
    - Admin SDK (Backend): `apps/backend/src/lib/firebaseAdmin.ts`
  - **API Routes**: `apps/backend/src/api/v1/`
  - **Frontend UI**: `apps/frontend/src/app/`, `apps/frontend/src/components/`

  ---

  ## 🗄️ Archived & Legacy Code

  - **API Endpoints**: Archived API logic can be found within `apps/backend/src/api/v1/archive/`.
  - **Components**: Archived UI components are in `apps/frontend/src/components/archive/`.
  - **Pages**: The root `pages/` directory (e.g., `pages/api/ingest.ts`) contains older Next.js pages/api routes. Its relevance to the current monorepo structure should be reviewed.

  ---

  ## 🧩 Extensibility

  ### Adding New Q&A Patterns
  - Modify regex patterns and Q&A generation logic in `apps/backend/src/lib/preprocess.ts`.
  - Ensure patterns are generic and not business-specific.

  ### Privacy & Security
  - The system is designed to avoid exposing backend-only data or secrets to the frontend.
  - Q&A generation relies solely on the data provided through uploads or public URLs, processed by the backend.

  ---

  ## 🧪 Testing & Development

  ### Running the Development Servers
  - **Frontend**: `npm run dev:frontend` (typically `http://localhost:3000`)
  - **Backend**: `npm run dev:backend` (port configured in `apps/backend/.env` or server setup)
  - Use the admin dashboard on the frontend to upload data and test chat responses, which will interact with the backend API.

  ### Running Tests
  - **Unit/Integration Tests (Jest)**:
    - Test files are co-located or in `__tests__` directories within `apps/frontend/src`, `apps/backend/src`, and `packages/shared/src`.
    - Run with `npm test` (which should run tests for all workspaces) or target specific workspaces e.g., `npm test -w backend`.
  - **End-to-End Tests (Cypress)**:
    - Test files are in `cypress/e2e/`.
    - Configuration in `cypress.config.ts`.
    - Run with a script like `npm run cypress:open` or `npm run cypress:run`.

  ---

  ## 📝 Notes
  - UI is RTL-friendly, modern, and responsive, built with TailwindCSS.
  - The chat widget is designed to be embeddable.
  - Admin dashboard allows real-time settings updates.
  - Backend is a separate application (e.g., Express.js based on `apps/backend/src/server.ts`) providing APIs for the frontend.
  - Firebase is used for data storage (Firestore), authentication (Firebase Auth for users, Firebase Admin for backend verification), and potentially hosting.
  - Environment variables are managed via `.env` files in respective app directories (e.g., `apps/frontend/.env.local`, `apps/backend/.env`).


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
