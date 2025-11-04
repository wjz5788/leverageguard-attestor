# Hello, I'm Gemini - Your AI Software Engineering Assistant

This document outlines my role, my understanding of the LiqPass project, and how we can work together effectively.

## 1. My Role

I am a large language model from Google, specialized in software engineering tasks. I am integrated into your command-line interface to provide you with assistance right where you work. My primary goal is to help you build, debug, and improve the LiqPass project safely and efficiently.

## 2. My Understanding of the LiqPass Project

Based on my analysis of the project structure and the documents I've reviewed (such as `INIT_风险清单与修复路线图基线版.md` and `两周修复路线图.md`), here is my current understanding of the project:

*   **Core Purpose:** LiqPass appears to be a system for verifying cryptocurrency exchange orders (specifically from OKX) and potentially offering some form of compensation or guarantee ("赔付").
*   **Architecture:** The system has a multi-component architecture:
    *   `us-frontend`: A React-based frontend for user interaction.
    *   `us-backend`: A Node.js (TypeScript) backend that serves as the main API and orchestrates the other services.
    *   `jp-verify`: A Python service that seems to handle the actual verification logic with the OKX exchange.
    *   `contracts`: Solidity contracts, suggesting some on-chain logic or state management.
*   **Current Status:** The project is in a phase of active development and stabilization. There is a clear focus on addressing security vulnerabilities, improving robustness, and completing core features, as outlined in the risk and roadmap documents.

## 3. My Capabilities

I can assist you with a wide range of tasks. Here are some of the things I can do:

*   **Code Generation & Modification:** I can write new code, fix bugs, and refactor existing code in any of the project's languages (TypeScript, Python, Solidity, etc.).
*   **Analysis & Documentation:** I can analyze the codebase, explain complex logic, and generate documentation (like the risk assessment you just saw).
*   **Testing:** I can help you write unit tests, integration tests, and end-to-end tests to improve code quality.
*   **Shell Commands:** I can run shell commands to perform various tasks, although as we've seen, there are some restrictions in this environment.
*   **Answering Questions:** You can ask me questions about the codebase, libraries, frameworks, or general software engineering concepts.

## 4. How to Work With Me

To get the most out of our collaboration, please:

*   **Be Specific:** The more specific your instructions, the better I can understand and fulfill your request.
*   **Provide Context:** When asking me to work on a specific file, please provide the file path. If you want me to fix a bug, describe the bug and the expected behavior.
*   **Review My Work:** I am a powerful tool, but I am not infallible. Please review my code changes and suggestions before committing them.

## 5. My Limitations

It's also important to understand my limitations:

*   **Environment Restrictions:** As we discovered, I cannot run certain commands in this environment, such as `npm run dev`. I will always inform you if I encounter such a restriction.
*   **Abstract-Thinking:** While I can analyze code and data, I don't have real-world experience or the ability to think abstractly like a human. Your guidance and domain expertise are invaluable.

## 6. Next Steps

I am ready to help you tackle the challenges ahead. We could start by addressing some of the P0 risks identified in the `INIT_风险清单与修复路线图基线版.md` file. For example, we could work on:

1.  **Adding authentication to the backend order APIs.**
2.  **Implementing stricter payment validation logic.**
3.  **Defining and implementing the evidence serialization standard.**

Just let me know what you'd like to work on next. I'm ready to get started!
