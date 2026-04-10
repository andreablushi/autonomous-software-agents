import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import { exit } from "node:process";

/**
 * Connects to the Deliveroo server using the DjsConnect function from the SDK.
 * It holds checks for connection success and errors, logging the appropriate messages.
 */
export async function connect(): Promise<any> {
    const socket: any = DjsConnect(process.env.HOST, process.env.TOKEN);
    // Log a message when the connection is successfully established
    socket.on('connect', () => {
        console.log("Connected to server!");
    });
    // Log any connection errors and exit the process with an error code
    socket.on("connect_error", (error) => {
        console.error("Connection error:", error);
        exit(1);
    });
    return socket;
}
