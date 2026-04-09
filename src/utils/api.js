import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";

/**
 * Connects to the Deliveroo server using the DjsConnect function from the SDK.
 * It holds checks for connection success and errors, logging the appropriate messages.
 * @async
 * @returns 
 */
export async function connect() {
    // Connect to the Deliveroo server
    const socket = await DjsConnect(
        process.env.HOST,
        process.env.TOKEN
    );
    // Listen for connection events and log the status
	socket.onConnect(() => {
		console.log("Connected to server!");
	});
    // Listen for disconnection events and log the status
	socket.on("connect_error", (error) => {
		console.error("Connection error:", error);
	});

	return socket;
}
