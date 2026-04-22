import { connect } from "./utils/api.js";
import { BDIAgent } from "./agents/bdi/bdi_agent.js";
import { exit } from "node:process";

/**
 * Entry point of the application.
 */
async function main() {
    const debug = process.env.NODE_ENV === "development";
    const isCompetitive = process.env.COMPETITIVE === "true";

    // Otherwise start the single main agent.
    await startSingleAgent(debug);

    // In competitive mode, only start the competitive agents.
    if (isCompetitive) {
        await startCompetitiveAgents(debug);
        return;
    }
}

/**
 * Starts a single agent using TOKEN.
 * @param debug Whether to enable debug logging for the agent.
 */
async function startSingleAgent(debug: boolean): Promise<void> {
    const socket: any = await Promise.all([connect(process.env.TOKEN)]);
    new BDIAgent(socket[0], debug);
}

/**
 * Starts multiple agents using TOKEN_1, TOKEN_2, ...
 * @param debug Whether to enable debug logging for the agents.
 */
async function startCompetitiveAgents(debug: boolean): Promise<void> {
    // Collect all TOKEN_N from the environment variables
    const tokens: string[] = [];
    for (let i = 1; ; i++) {
        const token = process.env[`TOKEN_${i}`];
        if (!token) {
            break;
        }
        tokens.push(token);
    }

    // If no tokens are found, log an error and exit
    if (tokens.length === 0) {
        console.error("No TOKEN_1 found. Add TOKEN_1, TOKEN_2, ... to .env");
        exit(1);
    }

    // Launch an agent for each token and wait for all connections to be established before starting the agents
    console.log(`Launching ${tokens.length} competitive agent(s)...`);
    const sockets = await Promise.all(tokens.map((token) => connect(token)));
    sockets.forEach((socket) => new BDIAgent(socket, debug));
}


// Run the main function and catch any errors for logging
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
