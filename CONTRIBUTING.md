# Contributing

We welcome contributions to this project! Please follow these guidelines to ensure a smooth process.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Create a new branch:**
    It's important to create a new branch for each feature or bug fix you work on. This keeps the main branch clean and makes it easier to review your changes.
    ```bash
    git checkout -b feature/your-feature-name  # For new features
    # or
    git checkout -b fix/your-bug-fix-name    # For bug fixes
    ```

## Making Changes

1.  **Follow Style Guides:**
    *   Ensure your code adheres to the project's coding style guides. We use Prettier for code formatting and ESLint for linting.
    *   Run `npm run lint` and `npm run format` before committing your changes to catch any issues.

2.  **Write Clear Commit Messages:**
    *   Follow conventional commit message formats (e.g., `feat: add new login button`, `fix: resolve issue with user authentication`).

## Submitting Pull Requests (PRs)

1.  **Push your branch:**
    ```bash
    git push origin feature/your-feature-name
    ```

2.  **Open a Pull Request:**
    *   Go to the repository on GitHub (or your Git hosting platform).
    *   Click on "New pull request".
    *   Choose your branch to compare with the `main` (or `develop`) branch.
    *   Provide a clear title and description for your PR, explaining the changes you've made and why.
    *   Link to any relevant issues.

3.  **Code Review:**
    *   At least one other contributor will review your PR.
    *   Address any feedback or requested changes.
    *   Once approved, your PR will be merged.

## Running Tests

Ensure all tests pass before submitting your PR.

*   **Run unit tests:**
    ```bash
    npm test
    ```
*   **Run end-to-end tests (if applicable):**
    ```bash
    npm run cypress:run
    ```

Thank you for contributing!
