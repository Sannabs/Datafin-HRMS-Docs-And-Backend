import { networkInterfaces } from "os";

/**
 * Get the first non-internal IPv4 address from network interfaces (for local network URL).
 * @returns {string} IP address or 'localhost'
 */
export const getLocalIP = () => {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) {
                return net.address;
            }
        }
    }
    return "localhost";
};
