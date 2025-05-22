# New_Chat_Bot

## 🚀 Project Description

New_Chat_Bot is a modern, business-agnostic chatbot platform designed for seamless integration and ease of use. Built with a robust stack including Next.js 14 (App Router), TypeScript, Firebase, and OpenAI, this platform empowers businesses to create intelligent conversational experiences. It supports automatic extraction of Q&A pairs from various data sources and utilizes Retrieval-Augmented Generation (RAG) to provide contextually relevant answers. The system includes an admin dashboard for easy management of training data and settings.

---

## ✨ Key Features

-   **OpenAI & Pinecone Integration**: Leverages OpenAI for powerful language understanding and generation, and can be integrated with Pinecone for efficient vector search (though current implementation details might vary, the architecture supports it).
-   **Retrieval-Augmented Generation (RAG)**: The chat API answers questions based on extracted Q&A pairs from your uploaded data. If no answer is found, the bot transparently informs the user.
-   **Firebase Integration**: Utilizes Firebase for authentication, Firestore for data storage, and potentially Firebase Hosting for deployment.
-   **Admin Dashboard**: A user-friendly interface (`apps/frontend/src/app/admin/`) for uploading URLs/files, managing application settings, and viewing training data.
-   **Automated Q&A Extraction**: Automatically extracts Q&A pairs from business websites or uploaded files using generic, language-aware patterns.
-   **Extensible & Privacy-Focused**: Designed with no hardcoded business-specific logic, ensuring no backend secrets are exposed to the frontend, and making it easy to add new Q&A patterns.
-   **Monorepo Architecture**: Managed with npm workspaces, separating concerns into frontend (`apps/frontend`), backend (`apps/backend`), and shared packages (`packages/shared`) for better scalability and maintainability.

---

## 🛠️ Technologies Used

-   **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
-   **Backend**: Node.js with Express.js (implied by `server.ts` and middleware structure), TypeScript
-   **Database & Storage**: Firebase (Firestore, Firebase Storage for uploads)
-   **AI & Embeddings**: OpenAI API
-   **Vector Search**: Architecture supports integration with vector databases like Pinecone.
-   **Testing**: Jest, Cypress
-   **Package Management**: npm (with workspaces)

---

## 📦 Installation and Setup

### Prerequisites

-   Node.js (version recommended by Next.js and other dependencies, e.g., LTS)
-   npm (v7 or later for workspace support) or yarn
-   Firebase account and project setup.
-   OpenAI API key.

### Steps

1.  **Clone the repository:**
    ```bash
    git clone https://your-repository-url/NewChatBot.git
    cd NewChatBot
    ```

2.  **Install dependencies:**
    This project uses npm workspaces. Dependencies for all packages (frontend, backend, shared) will be installed from the root directory.

    Using npm:
    ```bash
    npm install
    ```
    Using yarn:
    ```bash
    yarn install
    ```

3.  **Set up environment variables:**
    Each application (`apps/backend` and `apps/frontend`) requires its own environment configuration.

    -   **Backend (`apps/backend/.env`):**
        Create a `.env` file in the `apps/backend` directory and add necessary variables (e.g., Firebase service account details, OpenAI API key, database URLs, port).
        Example:
        ```env
        OPENAI_API_KEY=your_openai_api_key
        FIREBASE_PROJECT_ID=your_firebase_project_id
        # Add other necessary backend environment variables
        ```

    -   **Frontend (`apps/frontend/.env.local`):**
        Create a `.env.local` file in the `apps/frontend` directory and add Firebase client configuration and backend API URL.
        Example:
        ```env
        NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
        NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
        # Add other necessary frontend environment variables
        NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 # Or your backend port
        ```
        *(Note: The backend port might be different, adjust `NEXT_PUBLIC_API_BASE_URL` accordingly based on your `apps/backend/.env` configuration.)*

4.  **Firebase Setup:**
    -   Ensure your Firebase project has Firestore, Firebase Authentication, and Firebase Storage enabled.
    -   Set up Firestore security rules (example in `firebase.json` or to be created).
    -   Download your Firebase Admin SDK service account key (JSON file) and configure it securely for the backend (e.g., via an environment variable or a secure path).

---

## 🚀 Usage

### Development Mode

1.  **Start the Backend Server:**
    From the root directory:
    ```bash
    npm run dev:backend
    # or
    yarn dev:backend
    ```
    The backend server will typically start on a port like `8080` (configurable in `apps/backend/.env`).

2.  **Start the Frontend Development Server:**
    From the root directory:
    ```bash
    npm run dev:frontend
    # or
    yarn dev:frontend
    ```
    The frontend Next.js app will typically start on `http://localhost:3000`.

3.  **Access the Application:**
    -   Open `http://localhost:3000` in your browser to see the frontend.
    -   Navigate to `http://localhost:3000/admin` to access the Admin Dashboard for data ingestion and management.

### Production Mode

1.  **Build the Applications:**
    From the root directory:
    ```bash
    npm run build
    # or
    yarn build
    ```
    This command should ideally build all workspaces (`frontend`, `backend`, `shared`). You might need to adjust the root `package.json` scripts if specific build commands are needed for each workspace (e.g., `npm run build -w backend && npm run build -w frontend`).

2.  **Start the Backend Server (Production):**
    After building, navigate to the backend's build output directory (e.g., `apps/backend/dist`) and run the server. The exact command depends on your backend setup.
    Example (if `apps/backend/package.json` has a `start` script):
    ```bash
    npm start -w backend
    # or
    yarn workspace backend start
    ```

3.  **Start the Frontend Server (Production):**
    Next.js applications are typically started using:
    ```bash
    npm start -w frontend
    # or
    yarn workspace frontend start
    ```
    This command runs the optimized production build of the Next.js app.

4.  **Deployment:**
    -   **Backend**: Deploy the `apps/backend` build to a Node.js hosting environment (e.g., Google Cloud Run, AWS Elastic Beanstalk, Heroku).
    -   **Frontend**: Deploy the `apps/frontend` Next.js application to a platform like Vercel (recommended for Next.js), Netlify, or Firebase Hosting.
    -   Ensure all environment variables are correctly configured in your deployment environment.

---

## 🗂️ Project Structure

This project is a monorepo managed with npm workspaces.

```
NewChatBot/
├── apps/
│   ├── backend/                  # Backend application (Express.js, TypeScript)
│   └── frontend/                 # Next.js frontend application
├── packages/
│   └── shared/                   # Shared utilities and types
├── cypress/                      # Cypress end-to-end tests
├── .firebaserc                   # Firebase project configuration
├── firebase.json                 # Firebase configuration (hosting, functions, firestore rules, etc.)
├── jest.config.js                # Jest test runner configuration
├── package.json                  # Root monorepo package.json
├── README.md                     # This file
└── ...                           # Other config files
```
*(For a more detailed structure, refer to the original README's "Project Structure" section if needed, as this is a summary.)*

---

## ⚙️ How It Works (Brief Overview)

1.  **Data Ingestion & Q&A Extraction (Backend)**: URLs or files are processed, content extracted, chunked, and used to generate Q&A pairs and embeddings.
2.  **Chat API (RAG) (Backend)**: User questions trigger a vector search for relevant context, which is then used with an LLM (OpenAI) to generate an answer.
3.  **Admin Dashboard (Frontend)**: Allows users to manage data sources, settings, and view training data.

---

## 🧪 Testing

-   **Unit/Integration Tests (Jest)**:
    Run with `npm test` or `yarn test` from the root. Target specific workspaces with `npm test -w <workspace-name>`.
-   **End-to-End Tests (Cypress)**:
    Run with `npm run cypress:open` or `npm run cypress:run`.

---

## 👥 Contributing

Please refer to `CONTRIBUTING.md` for detailed guidelines on:
-   Setting up the development environment.
-   Coding standards and practices.
-   Adding new features or Q&A patterns.
-   Submitting pull requests.

---

## 📜 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details (if one exists, otherwise assume MIT).

You can create a `LICENSE` file with the following content for MIT:

```
MIT License

Copyright (c) [Year] [Your Name/Organization]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📣 Contact & Support

For questions, feature requests, or support, please open an issue on the project's GitHub repository or contact the maintainers.
