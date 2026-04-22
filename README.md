# Delivery Autonomous Agents

A project focused on the development and analysis of autonomous software agents, exploring their design, implementation, and applications in the Deliveroo.js domain, for the University of Trento.

<table align="center">
  <tr>
    <td align="center">
      <strong>
        <a href="docs/report/report.pdf">View Full Report (PDF)</a>
      </strong><br><br>
      <a href="docs/report/report.pdf">
        <img src="docs/media/report-preview.png" width="200" alt="Report preview">
      </a>
    </td>
    <td align="center">
      <strong>
        <a href="docs/presentation/presentation.pdf">View Full Presentation (PDF)</a>
      </strong><br><br>
      <a href="docs/presentation/presentation.pdf">
        <img src="docs/media/presentation-preview.png" width="350" alt="Presentation preview">
      </a>
    </td>
  </tr>
</table>

**Course:** Autonomous Software Agents  
**Professors:** Prof. Paolo Giorgini, Prof. Marco Robol  
**Authors:** Davide Donà, Andrea Blushi

---

# Overview

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)

## Setup Environment

Copy the `.env.example` file to `.env` and fill in the required values:

```bash
cp .env.example .env
```

By default the agent connects to a local Deliveroo.js server at `http://localhost:8080`.
To start the server, follow the instructions in the [Deliveroo.js repository](https://github.com/unitn-ASA/Deliveroo.js).

Then, install the project dependencies:

```bash
npm install
```

## Running the Agent

| Command | Description |
|---|---|
| `npm build` | Compile TypeScript to JavaScript (output in `dist/`). |
| `npm start` | Single agent, production mode. |
| `npm run dev` | Single agent, debug logging enabled. |
| `npm run competitive` | Multiple agents, production mode. Uses `TOKEN_1`, `TOKEN_2`, ... from `.env` (one token per agent). |
| `npm run dev:competitive` | Multiple agents, development mode with debug logging enabled. Uses `TOKEN_1`, `TOKEN_2`, ... from `.env`. |


## Repository Structure

```
autonomous-software-agents/
├── src/                        # Source code of the project
│   ├── index.ts                # Entry point of the application
│   ├── agents/                 # Directory for different agent implementations
│   │   ├── bdi/                # BDI agent implementation
│   │   │   ├── bdi_agent.ts    # Main BDI agent class
│   │   │   ├── belief/         # Belief management module
│   │   │   ├── desire/         # Desire generation and filter module
│   │   │   ├── intention/      # Intention selection and execution module
│   │   │   └── navigation/     # Plan library and navigation module
│   │   └── llm/                # LLM-based agent implementation
│   │       ├── llm_agent.js    # Main LLM agent class
│   │       └── prompts/        # Directory for prompt templates and management
│   ├── models/                 # Data types definitions and interfaces
│   └── utils/                  # Utility functions and modules
├── docs/                       # Documentation and related materials
```
