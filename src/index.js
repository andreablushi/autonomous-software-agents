import { connect } from "./utils/api.js";
import { BDIAgent } from "./agents/bdi/bdi_agent.js";

/**
 * Entry point of the application. 
*/
async function main() {
    // Connect to the server and get the socket instance
    const socket = await connect();
    // Create an instance of the BDI Agent with the socket connection
    new BDIAgent(socket);
}

// Run the main function and catch any errors for logging
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
